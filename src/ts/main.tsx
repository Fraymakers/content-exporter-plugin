// Styles
import 'mini.css/dist/mini-dark.css';

// Other imports
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import FrayToolsPluginCore from '@fraytools/plugin-core';
import FraymakersContentExporter from './FraymakersContentExporter';
import { IManifestJson } from '@fraytools/plugin-core/lib/types';
import { IFraymakersContentExporterConfig } from './types';

declare var MANIFEST_JSON:IManifestJson;

// Default config
const configDefaults:IFraymakersContentExporterConfig = {
  version: MANIFEST_JSON.version,
  jsonCompression: 'base64',
  pngCompression: false
}

// Informs FrayToolsPluginCore of the default config metadata for plugin when it first gets initialized
FrayToolsPluginCore.PLUGIN_CONFIG_METADATA_DEFAULTS = configDefaults;

FrayToolsPluginCore.migrationHandler = (configMetadata:IFraymakersContentExporterConfig) => {
  // Compare configMetadata.version here with your latest manifest version and perform any necessary migrations for compatibility
  if (configMetadata.version == '0.0.16') {
    configMetadata.version = '0.0.17';
    configMetadata.jsonCompression = 'base64';
    configMetadata.pngCompression = false;
  }
};
FrayToolsPluginCore.setupHandler = (props) => {
  // Create a new container for the plugin
  var appContainer = document.createElement('div');
  appContainer.className = 'FraymakersContentExporterWrapper';
  document.body.appendChild(appContainer);

  // Load the component with its props into the document body
  ReactDOM.render(<FraymakersContentExporter {...props} />, appContainer);
};
