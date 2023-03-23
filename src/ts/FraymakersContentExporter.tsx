// Other imports
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as _ from 'lodash';
import './FraymakersContentExporter.scss';
import { byteArrayToArrayBuffer } from '@fraytools/plugin-core/lib/util/ByteUtil';
import FrayToolsPluginCore from '@fraytools/plugin-core';
import BasePublishPlugin, { IPublishPluginProps, IPublishPluginState } from '@fraytools/plugin-core/lib/base/BasePublishPlugin';
import Exporter, { JsonExportFormat } from './Exporter';
import { IFraymakersContentExporterConfig, IFraymakersManifest } from './types';

// OpenFL Stuff
import ByteArray from 'openfl/utils/ByteArray';
import { IManifestJson, PublishPluginMessageDataFilesMap } from '@fraytools/plugin-core/lib/types';
import { ILibraryAssetMetadata } from '@fraytools/plugin-core/lib/types/fraytools';

declare var MANIFEST_JSON:IManifestJson;

// Main UI
interface IFraymakersContentExporterProps extends IPublishPluginProps {
  configMetadata: IFraymakersContentExporterConfig;
}
interface IFraymakersContentExporterState extends IPublishPluginState {
  manifest?:IFraymakersManifest;
  isPublishing?:boolean;
  isErrored?:boolean;
  errorType?:string;
  errorMessage?:string;
  publishProgress?:number;
}

/**
 * UI for Fraymakers Content exporter
 */
export default class FraymakersContentExporter extends BasePublishPlugin<IFraymakersContentExporterProps, IFraymakersContentExporterState> {
  constructor(props) {
    super(props);
    this.onProgress = this.onProgress.bind(this);

    let manifest:IFraymakersManifest = null;
    let isErrored = false;
    let errorType = null;
    let errorMessage = null;
    if (!this.props.configMode) {
      try {
        manifest = JSON.parse(_.find(this.props.scriptAssets, (scriptAsset) => scriptAsset.id === 'manifest').script);
      } catch(e) {
        isErrored = true;
        errorType = 'Manifest Parse Error';
        errorMessage = `Problem parsing manifest: ${e.message}`;
        FrayToolsPluginCore.log('error', e);
      }
    }
    this.state = {
      manifest: manifest,
      isPublishing: false,
      isErrored: isErrored,
      errorType: errorType,
      errorMessage: errorMessage,
      publishProgress: 0
    };
  }

  /**
   * Force this component to re-render when parent window sends new props
   */
  onPropsUpdated(props) {
    ReactDOM.render(<FraymakersContentExporter {...props} />, document.querySelector('.FraymakersContentExporterWrapper'));
  }

  onForcePublishRequest() {
    if (!this.state.isErrored) {
      this.publish();
    } else {
      FrayToolsPluginCore.sendPublishError(this.state.errorMessage);
    }
  }

  onProgress(value:number) {
    this.setState({ publishProgress: value });
  }

  /**
   * This function should be called when you desire to send new persistent data back to the parent
   */
  publish() {
    // First must always inform the parent that a publish has started
    FrayToolsPluginCore.sendPublishStart();

    FrayToolsPluginCore.log('log', 'Processing media files...');
    
    this.setState({ isPublishing: true }, () => {
      // Now we can begin the export process
      var exporter = new Exporter({
        outputFolders: this.props.outputFolders,
        guidToAsset: this.props.guidToAsset,
        spriteEntityAssets: this.props.spriteEntityAssets,
        imageAssets: this.props.imageAssets,
        audioAssets: this.props.audioAssets,
        binaryAssets: this.props.binaryAssets,
        scriptAssets: this.props.scriptAssets,
        paletteCollectionAssets: this.props.paletteCollectionAssets,
        nineSliceAssets: this.props.nineSliceAssets,
        exportFormat: this.props.configMetadata.jsonCompression,
        pngCompression: this.props.configMetadata.pngCompression,
        onProgress: this.onProgress
      });
  
      exporter.toByteArray()
        .then((bytes:ByteArray) => {
          let files:PublishPluginMessageDataFilesMap = {};
          _.each(this.props.outputFolders, (folder) => {
            files[folder.id] = files[folder.id] || [];
            files[folder.id].push({
              filename: this.state.manifest.resourceId + '.fra',
              arrayBuffer: byteArrayToArrayBuffer(bytes)
            });
          });
          
          this.setState({
            isPublishing: false
          }, () => {
            FrayToolsPluginCore.sendPublishEnd(files);
          });
        })
        .catch((e) => {
          FrayToolsPluginCore.log('error', e);
          
          this.setState({
            isErrored: true,
            errorType: 'Publish Error',
            errorMessage: e.toString(),
            isPublishing: false
          }, () => {
            FrayToolsPluginCore.sendPublishError(this.state.errorMessage);
          });
        });
    });
  }
  onJsonCompressionChange(evt:React.ChangeEvent<HTMLSelectElement>) {
    let configMetadata:IFraymakersContentExporterConfig = {
      ...this.props.configMetadata,
      jsonCompression: evt.currentTarget.value as JsonExportFormat
    };

    FrayToolsPluginCore.configMetadataSync(configMetadata);
  }
  onPngCompressionChange(evt:React.ChangeEvent<HTMLSelectElement>) {
    let configMetadata:IFraymakersContentExporterConfig = {
      ...this.props.configMetadata,
      pngCompression: evt.currentTarget.value == 'true' ? true : false
    };

    FrayToolsPluginCore.configMetadataSync(configMetadata);
  } 
  render() {
    if (this.props.configMode) {
      return (
        <form>
          <fieldset>
            <legend>Configuration</legend>
            <div className="row responsive-label">
              <div className="col-sm-12 col-md-3">
                <label htmlFor="jsonCompression">JSON Compression Type:</label>
              </div>
              <div className="col-sm-12 col-md">
                <select id="jsonCompression" value={this.props.configMetadata.jsonCompression} onChange={this.onJsonCompressionChange.bind(this)}>
                  <option value="raw">Raw</option>
                  <option value="base64">Base64</option>
                  <option value="prettify">Prettify</option>
                </select>
              </div>
            </div>
            <div className="row responsive-label">
              <div className="col-sm-12 col-md-3">
                <label htmlFor="pngCompression">PNG Compression:</label>
              </div>
              <div className="col-sm-12 col-md">
                <select id="pngCompression" value={`${this.props.configMetadata.pngCompression}`} onChange={this.onPngCompressionChange.bind(this)}>
                  <option value="false">Disabled (Faster / Larger file size)</option>
                  <option value="true">Enabled (Slower / Smaller file size)</option>
                </select>
              </div>
            </div>
          </fieldset>
        </form>
      );
    }

    return (
      <div className="FraymakersContentExporter container" style={{ textAlign: 'center' }}>
        <h2>Fraymakers Content Exporter v{MANIFEST_JSON.version}</h2>
        {(() => {
          if (this.state.manifest) {
            return (
              <p><strong>Resource ID:</strong> <code>{this.state.manifest.resourceId}</code></p>
            );
          } else {
            return (
              <p><strong>Resource ID:</strong> [Error locating manifest]</p>
            );
          }
        })()}
        <p><strong>Output folders:</strong> {_.map(this.props.outputFolders, (folder) => folder.id).join(', ') || '(None)'}</p>
        <p><strong>Sprite entities:</strong> {_.map(_.filter(this.props.spriteEntityAssets, (e) => e.id && e.export ? true : false), (entity) => entity.id).join(', ') || '(None)'}</p>
        <p><strong>Nine Slices: </strong>{_.map(this.props.nineSliceAssets, (nineSlice) => nineSlice.id).join(', ') || '(None)'}</p>
        <p><strong>Spritesheets:</strong> {_.map(_.groupBy(_.filter(_.concat(this.props.spriteEntityAssets as ILibraryAssetMetadata[], this.props.nineSliceAssets as ILibraryAssetMetadata[]), (e) => e.id && e.export ? true : false), (spriteEntity) => {
          return spriteEntity.pluginMetadata['com.fraymakers.FraymakersMetadata'] ? spriteEntity.pluginMetadata['com.fraymakers.FraymakersMetadata'].spritesheetGroup || 'default' : 'default';
        }), (group, key) => `${key}(${_.map(group, (g) => g.id).join(', ')})`).join(', ') || '(None)'}</p>
        <p><strong>Total images:</strong> {this.props.imageAssets.length}</p>
        <p><strong>Total audio:</strong> {this.props.audioAssets.length}</p>
        <p><strong>Total scripts:</strong> {this.props.scriptAssets.length}</p>
        <p><strong>Total binary assets:</strong> {this.props.binaryAssets.length}</p>
        {(() => {
          if (this.state.isPublishing) {
            return (
              <div className="row">
                <div className="col-sm-1"></div>
                <div className="col-sm-10"><progress className="primary" value={Math.round(this.state.publishProgress * 10)} max={1000}/></div>
                <div className="col-sm-1"></div>
              </div>
            );
          } else {
            return (
              <div className="row">
                <div className="col-sm-12">
                  <button disabled={this.state.isErrored} className="primary tooltip" aria-label="Initiate Publish" onClick={(e) => this.publish()}>Start Publish</button>
                  <div className="row">
                    <div className="col-sm-12">
                      {(() => {
                        if (this.state.isErrored) {
                          return (
                            <div className="row">
                              <div className="card error center">
                                <div className="section">
                                  <h3>{this.state.errorType}</h3>
                                  <p>{this.state.errorMessage}</p>
                                </div>
                              </div>
                            </div>
                          );
                        } 
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            );
          }
        })()}
      </div>
    );
  }
}
