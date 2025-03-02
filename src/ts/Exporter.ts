import * as _ from 'lodash';
import { PNG } from 'pngjs/browser';
import { Base64 } from 'js-base64';
import SpriteUtil from '@fraytools/plugin-core/lib/util/SpriteUtil';
import TweenType from '@fraytools/plugin-core/lib/enums/TweenType';
import TweenUtil from '@fraytools/plugin-core/lib/util/TweenUtil';
import { arrayBufferToByteArray } from '@fraytools/plugin-core/lib/util/ByteUtil';
import FrayToolsPluginCore from '@fraytools/plugin-core';

// OpenFL stuff
import Bitmap from 'openfl/display/Bitmap';
import BitmapData from 'openfl/display/BitmapData';
import PNGEncoderOptions from 'openfl/display/PNGEncoderOptions';
import Matrix from 'openfl/geom/Matrix';
import Point from 'openfl/geom/Point';
import Rectangle from 'openfl/geom/Rectangle';
import ByteArray from 'openfl/utils/ByteArray';
import Endian from 'openfl/utils/Endian';
import Loader from 'openfl/display/Loader';
import Event from 'openfl/events/Event';
import { BaseSymbolKeyframeTypes, BaseSymbolTypes, IAudioAssetMetadata, IBinaryAssetMetadata, ICollisionBodyKeyframe, ICollisionBodySymbol, ICollisionBoxKeyframe, ICollisionBoxSymbol, IFrameScriptKeyframe, IFrameScriptLayer, IImageAssetMetadata, IImageKeyframe, IImageSymbol, ILabelKeyframe, ILibraryAssetMetadata, ILineSegmentKeyframe, ILineSegmentSymbol, INineSliceAssetMetadata, IPaletteCollectionAssetMetadata, IPointKeyframe, IPointSymbol, IPolygonKeyframe, IPolygonSymbol, IScriptAssetMetadata, ISpriteAnimation, ISpriteEntityAssetMetadata, ITilemapKeyframe, ITilemapLayer, ITilemapSymbol, LayerTypeValues } from '@fraytools/plugin-core/lib/types/fraytools';
import { IFraymakersPaletteData, IFraymakersPaletteMapEntry } from './types';

const stringify  = require('json-stable-stringify');

export type JsonExportFormat = 'base64' | 'raw' | 'prettify';

/** Bitmap data to use as a placeholder if an image asset is missing */
const MISSING_IMAGE:BitmapData = new BitmapData(100, 100, false, 0xffff1493);

/** Version number to assign to the asset (must match latest engine version) */
const ASSET_VERSION = '0.0.17';

/**
 * Helper for calculating progress bar growth ratios based on the operation size
 */
var ProgressRatios = {
  media: 0.30,
  animations: 0.69,
  write: 0.01
};

// Helper type for remembering where an image asset exists on a spritesheet along with its trimmed data
interface ISpriteFrame {
  /** Index representing which parent spritesheet contains this sprite. */
  sheetIndex: number;
  /** Index representing this sprite's index within the parent spritesheet's data. */
  frameIndex: number;
  /** Rectangle representing the location and size of the frame for the sprite within its parent spritesheet. */
  frameRect: Rectangle;
  /** Offset point used during the image symbol export process. Bitmaps will have transparent areas trimmed by default, and their offsets tracked here. */
  trimOffset: Point;
  /** Reference to the sprite's frame bitmap data with transparency trimmed */
  trimmedBitmapData: BitmapData;
}

/** Helper type for tracking the group a spritesheet belongs to */
interface ISpriteSheetGroupMap {
  /** Group id pointing to the ISpriteSheetWriteData instance currently being written to for this group. */
  [groupId:string]: ISpriteSheetWriteData;
}

/** Helper type for tracking the write progress of a spritesheet */
interface ISpriteSheetWriteData {
  /** The bitmap data for the current spritesheet. May be replaced during dynamic resizes. */
  bitmapData: BitmapData;
  /** Cursor indicating the next position on the spritesheet to write to */
  cursor: Point;
  /** Current maximum Y position of the current row (to determine necessary Y position of the next row)*/
  maxY:number;
  /** Index of the most recent frame inserted into this spritesheet */
  frameIndex:number;
  /** Index of the sheet for this spritesheet within the list of other spritesheets in the same group */
  groupSheetIndex:number;
  /** Ordered rectangle data for each sprite frame */
  rects:Rectangle[];
  /** Tracks the group id of this spritesheet for reference */
  groupId:string;
}

// Engine data Interfaces below
interface IResourceData {
  version: string;
  spritesheets:ISpriteSheetData[];
  images:IImageData[];
  audio:IAudioData[];
  binary:IBinaryData[];
  scripts:IScriptData[];
  entities:ISpriteEntityData[];
  nineSlices:INineSliceData[];
}

interface ISpriteSheetData {
  version: number;
  bytesOffset: number;
  bytesLength: number;
  frames: number[];
  group: string;
}

type ImageAssetMetadata = any;

interface IAssetData {
  version: number;
  id: string;
  guid: string;
  tags: string[];
  metadata?:any;
}

interface IImageData extends IAssetData {
  bytesOffset: number;
  bytesLength: number;
  metadata?:ImageAssetMetadata;
}

type AudioAssetMetadata = any;

interface IAudioData extends IAssetData {
  format: string;
  bytesOffset: number;
  bytesLength: number;
  metadata?:AudioAssetMetadata;
}

type BinaryAssetMetadata = any;

interface IBinaryData extends IAssetData {
  bytesOffset: number;
  bytesLength: number;
  metadata?:BinaryAssetMetadata;
}

type SpriteEntityAssetMetadata = any;

interface ISpriteEntityData extends IAssetData {
  animations: ISpriteAnimationData[];
  metadata?:SpriteEntityAssetMetadata;
}

type ScriptAssetMetadata = any;

interface IScriptData extends IAssetData {
  language: string;
  value: string;
  metadata?:ScriptAssetMetadata;
}
type SpriteAnimationMetadata = any;

interface ISpriteAnimationData {
  name: string;
  layers: ILayerData[];
  metadata?:SpriteAnimationMetadata;
}

type LayerMetadata = any;

interface ILayerData {
  type: LayerTypeValues;
  keyframes: IKeyframeData[];
  // All
  name: string;
  // Frame Script
  language?: string;
  // Tilemap
  tileWidth?: number;
  tileHeight?: number;
  tileset?: number;
  // Other
  metadata?:LayerMetadata;
}

type KeyframeMetadata = any;

interface IKeyframeData {
  length: number;
  // Label
  name?: string;
  // Frame Script
  code?: string;
  // Symbol
  symbol?: ISymbolData;
  // Other
  metadata?:KeyframeMetadata;
}

interface ISymbolLightboxMetadata {
	radius?:number;
	color?:number;
	intensity?:number;
	shadowHeightMultiplier?:number,
	type?:number;
}

interface ISymbolStructureMetadata {
	structureType?:'NONE'|'LEFT_WALL'|'RIGHT_WALL'|'FLOOR'|'CEILING'|'AUTO';
}

type SymbolMetadata = ISymbolLightboxMetadata | ISymbolStructureMetadata;

interface ISymbolData {
  // All
  data: number[];
  // Collision Box, Polygon, Line Segment, Collision Body, Point
  color?:string;
  // Polygon, Line Segment
  points?:number[];
  // Tilemap
  tiles?:number[];
  // Other
  metadata?:SymbolMetadata;
}

interface INineSliceData extends IAssetData {
  sheetIndex:number;
  frameIndex:number;
  borderLeft:number;
  borderTop:number;
  borderRight:number|null;
  borderBottom:number|null;
}

interface IExporterConfig {
  outputFolders:{ id:string; path:string }[];
  guidToAsset:{ [guid:string]: { metadata:ILibraryAssetMetadata, binaryData?:Uint8Array, byteArray?:ByteArray, bitmapData?:BitmapData, filename?:string } };
  spriteEntityAssets:ISpriteEntityAssetMetadata[];
  imageAssets:IImageAssetMetadata[];
  audioAssets:IAudioAssetMetadata[];
  binaryAssets:IBinaryAssetMetadata[];
  scriptAssets:IScriptAssetMetadata[];
  paletteCollectionAssets:IPaletteCollectionAssetMetadata[];
  nineSliceAssets:INineSliceAssetMetadata[];
  exportFormat:JsonExportFormat;
  pngCompression:boolean;
  onProgress: (value:number) => void;
}

/**
 * The Exporter class is used to generate a ByteArray containing the project data in the form of JSON data appended with binary file data. Those bytes can then be written directly to a file.
 */
export default class Exporter {
  // TODO: Make these sheet sizes configurable
  private static DEFAULT_SHEET_WIDTH: number = 128;
  private static DEFAULT_SHEET_HEIGHT: number = 128;
  private static MAX_SHEET_WIDTH: number = 4096;
  private static MAX_SHEET_HEIGHT: number = 4096;
  private static DEFAULT_SHEET_PADDING: number = 1;

  private static SPRITESHEET_VERSION: number = 0; // TODO: Eventually add this

  private m_config:IExporterConfig;
  private m_spriteFrameCache: {[spritesheetGroupId:string]: {[guid:string]: ISpriteFrame}}; // Map of ImageAsset GUID => sheetID/frameID/trimmedBitmapData, categorized by spritesheet group name
  private m_bitmapDataCacheMap:{[spritesheetGroupId:string]: {[width:string]: {[height: string]: ISpriteFrame[]}}}; // Map of "width x height" bitmapDatas and all sprite frames that match that criteria grouped by spritesheet group
  private m_spritesheetGroupMap: ISpriteSheetGroupMap; // Holds onto the current ISpriteSheetWriteData instance for each spritesheet group
  private m_spritesheetWriteDatas: ISpriteSheetWriteData[];
  private m_binaryData: ByteArray;


  constructor(config:IExporterConfig) {
    this.m_config = config;
  }

  /**
   * Recurses into each animation to build spritesheets
   * @param spriteEntityData Object used for generating the final output JSON format
   * @param spriteEntityMetadata Object provided by FrayTools containing all of the sprite entity's animation data
   * @param animation The animation to process
   */
  private processAnimation(spriteEntityData:ISpriteEntityData, spriteEntityMetadata: ISpriteEntityAssetMetadata, animation:ISpriteAnimation, spritesheetGroup:string) {
    return Promise.resolve()
      .then(() => {
        FrayToolsPluginCore.log('debug', '--> Writing SpriteAnimation: ' + animation.name);
    
        let currentAnimation: ISpriteAnimationData = {
          name: animation.name,
          layers: [],
          // Inject plugin metadata if it exists
          metadata: (animation.pluginMetadata['com.fraymakers.FraymakersMetadata']) ? {...animation.pluginMetadata['com.fraymakers.FraymakersMetadata']} : {}
        };
    
        _.each(animation.layers, (layer_id, layer_index) => {
          let layer = _.find(spriteEntityMetadata.layers, (entry) => entry.$id === layer_id);
          if (!layer) {
            FrayToolsPluginCore.log('warn', `----> Could not find layer id: ${layer_id}`);

            return;
          }
          FrayToolsPluginCore.log('debug', '----> Writing Layer: ' + layer.name);
          let currentLayer: ILayerData = {
            name: layer.name,
            type: layer.type,
            keyframes: [],
            // Inject plugin metadata if it exists
            metadata: (layer.pluginMetadata['com.fraymakers.FraymakersMetadata']) ? {...layer.pluginMetadata['com.fraymakers.FraymakersMetadata']} : {}
          };
          
          if (layer.type === 'TILEMAP') {
            let tilemapLayer = layer as ITilemapLayer;
            currentLayer.tileWidth = tilemapLayer.tileWidth;
            currentLayer.tileHeight = tilemapLayer.tileHeight;
            currentLayer.tileset = 0; // TODO: Tileset id needs to be determined based on its entry in the output data, similar to spritesheets
          } else if (layer.type === 'FRAME_SCRIPT') {
            let scriptLayer = layer as IFrameScriptLayer;
    
            currentLayer.language = scriptLayer.language || 'hscript';
          }
    
          _.each(layer.keyframes, (keyframe_id, keyframe_index) => {
            let keyframe = _.find(spriteEntityMetadata.keyframes, (entry) => entry.$id === keyframe_id);
            if (!layer) {
              FrayToolsPluginCore.log('warn', `------> Could not find keyframe id: ${layer_id}`);

              return;
            }
            FrayToolsPluginCore.log('debug', '------> Writing keyframe ' + keyframe_index + '...');
            let currentKeyframe: IKeyframeData = {
              length: keyframe.length,
              // Inject plugin metadata if it exists
              metadata: (keyframe.pluginMetadata['com.fraymakers.FraymakersMetadata']) ? {...keyframe.pluginMetadata['com.fraymakers.FraymakersMetadata']} : {}
            };
            
            if (keyframe.type === 'IMAGE') {
              let symbolKeyframe = keyframe as IImageKeyframe;
    
              if (symbolKeyframe.symbol) {
                let symbol = _.find(spriteEntityMetadata.symbols, (entry) => entry.$id === symbolKeyframe.symbol) as IImageSymbol;
                if (!symbol) {
                  FrayToolsPluginCore.log('warn', `--------> Could not find image symbol id: ${symbolKeyframe.symbol}`);
                } else {
                  let imageAsset = this.m_config.guidToAsset[symbol.imageAsset];

                  let cachedSpriteFrame: ISpriteFrame = null;
                  if (imageAsset) {
                    cachedSpriteFrame = this.getOrWriteImageAssetToSheet(imageAsset, spritesheetGroup);
                  } else {
                    FrayToolsPluginCore.log('warn', `--------> Missing image asset: ${symbol.imageAsset} in animation ${animation.name} keyframe: ${keyframe_index}. Will use placeholder...`);
                    imageAsset = {
                      bitmapData: MISSING_IMAGE,
                      metadata: {
                        version: 0,
                        guid: '__placeholder__',
                        id: '',
                        export: true,
                        tags: [],
                        plugins: [],
                        pluginMetadata: {}
                      },
                      filename: 'placeholder.png'
                    };
                    cachedSpriteFrame = this.getOrWriteImageAssetToSheet(imageAsset, spritesheetGroup);
                  }

                  FrayToolsPluginCore.log('debug', `--------> Writing image symbol ${imageAsset.filename}...`);
      
                  // Correct image position based on rotation (trimming causes an incorrect displacement)
                  let realX = symbol.x + this.m_spriteFrameCache[spritesheetGroup][imageAsset.metadata.guid].trimOffset.x * symbol.scaleX;
                  let realY = symbol.y + this.m_spriteFrameCache[spritesheetGroup][imageAsset.metadata.guid].trimOffset.y * symbol.scaleY;
                  
                  if (symbol.rotation !== 0) {
                    let trimMagnitude = Point.distance(new Point(0, 0), new Point(this.m_spriteFrameCache[spritesheetGroup][imageAsset.metadata.guid].trimOffset.x * symbol.scaleX, this.m_spriteFrameCache[spritesheetGroup][imageAsset.metadata.guid].trimOffset.y * symbol.scaleY));
                    let pivotAngle = Math.atan2(
                      (this.m_spriteFrameCache[spritesheetGroup][imageAsset.metadata.guid].trimOffset.y * symbol.scaleY - 0),
                      (this.m_spriteFrameCache[spritesheetGroup][imageAsset.metadata.guid].trimOffset.x * symbol.scaleX - 0)
                    ) * 180 / Math.PI;
                    // Calculate offset to the trim based on the additional angle introduced by the symbol rotation
                    let cosA = Math.cos((Math.PI * (360 - (symbol.rotation + pivotAngle))) / 180);
                    let sinA = Math.sin((Math.PI * (360 - (symbol.rotation + pivotAngle))) / 180);

                    realX = symbol.x + trimMagnitude * cosA;
                    realY = symbol.y + trimMagnitude * -sinA;
                  }

                  // Convert to slimmer data format
                  currentKeyframe.symbol = {
                    data: [
                      realX,
                      realY,
                      symbol.alpha,
                      symbol.pivotX,
                      symbol.pivotY,
                      symbol.rotation,
                      symbol.scaleX,
                      symbol.scaleY,
                      cachedSpriteFrame.sheetIndex,
                      cachedSpriteFrame.frameIndex
                    ],
                    // Inject plugin metadata if it exists
                    metadata: (symbol.pluginMetadata['com.fraymakers.FraymakersMetadata']) ? {...symbol.pluginMetadata['com.fraymakers.FraymakersMetadata']} : {}
                  };
                }
              } else {
                currentKeyframe.symbol = null;
              }
            } else if (keyframe.type === 'COLLISION_BOX') {
              let symbolKeyframe = keyframe as ICollisionBoxKeyframe;
    
              if (symbolKeyframe.symbol) {
                let symbol = _.find(spriteEntityMetadata.symbols, (entry) => entry.$id === symbolKeyframe.symbol) as ICollisionBoxSymbol;
                if (!symbol) {
                  FrayToolsPluginCore.log('warn', `--------> Could not find collision box symbol id: ${symbolKeyframe.symbol}`);
                } else {
                  FrayToolsPluginCore.log('debug', '--------> Writing collision box symbol ' + symbolKeyframe.symbol + '...');
                  // Convert to slimmer data format
                  currentKeyframe.symbol = {
                    color: symbol.color,
                    data: [symbol.x, symbol.y, symbol.alpha, symbol.pivotX, symbol.pivotY, symbol.rotation, symbol.scaleX, symbol.scaleY],
                    // Inject plugin metadata if it exists
                    metadata: (symbol.pluginMetadata['com.fraymakers.FraymakersMetadata']) ? {...symbol.pluginMetadata['com.fraymakers.FraymakersMetadata']} : {}
                  };
                }
              } else {
                currentKeyframe.symbol = null;
              }
            } else if (keyframe.type === 'FRAME_SCRIPT') {
              let scriptKeyframe = keyframe as IFrameScriptKeyframe;

              currentKeyframe.code = scriptKeyframe.code;
            } else if (keyframe.type === 'LABEL') {
              let labelKeyframe = keyframe as ILabelKeyframe;
    
              currentKeyframe.name = labelKeyframe.name;
            } else if (keyframe.type === 'POLYGON') {
              let symbolKeyframe = keyframe as IPolygonKeyframe;
    
              if (symbolKeyframe.symbol) {
                let symbol = _.find(spriteEntityMetadata.symbols, (entry) => entry.$id === symbolKeyframe.symbol) as IPolygonSymbol;
                if (!symbol) {
                  FrayToolsPluginCore.log('warn', `--------> Could not find polygon symbol id: ${symbolKeyframe.symbol}`);
                } else {
                  FrayToolsPluginCore.log('debug', '--------> Writing polygon symbol ' + symbolKeyframe.symbol + '...');
                  
                  // Convert to slimmer data format
                  currentKeyframe.symbol = {
                    color: symbol.color,
                    data: [symbol.x, symbol.y, symbol.alpha, symbol.rotation],
                    points: symbol.points,
                    // Inject plugin metadata if it exists
                    metadata: (symbol.pluginMetadata['com.fraymakers.FraymakersMetadata']) ? {...symbol.pluginMetadata['com.fraymakers.FraymakersMetadata']} : {}
                  };
                }
              } else {
                currentKeyframe.symbol = null;
              }
            } else if (keyframe.type === 'LINE_SEGMENT') {
              let symbolKeyframe = keyframe as ILineSegmentKeyframe;
    
              if (symbolKeyframe.symbol) {
                let symbol = _.find(spriteEntityMetadata.symbols, (entry) => entry.$id === symbolKeyframe.symbol) as ILineSegmentSymbol;
                if (!symbol) {
                  FrayToolsPluginCore.log('warn', `--------> Could not find line segment symbol id: ${symbolKeyframe.symbol}`);
                } else {
                  FrayToolsPluginCore.log('debug', '--------> Writing line segment symbol ' + symbolKeyframe.symbol + '...');
                  // Convert to slimmer data format
                  currentKeyframe.symbol = {
                    color: symbol.color,
                    data: [symbol.alpha],
                    points: symbol.points,
                    // Inject plugin metadata if it exists
                    metadata: (symbol.pluginMetadata['com.fraymakers.FraymakersMetadata']) ? {...symbol.pluginMetadata['com.fraymakers.FraymakersMetadata']} : {}
                  };
                }
              } else {
                currentKeyframe.symbol = null;
              }
            } else if (keyframe.type === 'COLLISION_BODY') {
              let symbolKeyframe = keyframe as ICollisionBodyKeyframe;
    
              if (symbolKeyframe.symbol) {
                let symbol = _.find(spriteEntityMetadata.symbols, (entry) => entry.$id === symbolKeyframe.symbol) as ICollisionBodySymbol;
                if (!symbol) {
                  FrayToolsPluginCore.log('warn', `--------> Could not find collision body symbol id: ${symbolKeyframe.symbol}`);
                } else {
                  FrayToolsPluginCore.log('debug', '--------> Writing collision body symbol ' + symbolKeyframe.symbol + '...');
                  // Convert to slimmer data format
                  currentKeyframe.symbol = {
                    color: symbol.color,
                    // [headPosition, hipWidth, hipXOffset, hipYOffset, footPosition]
                    data: [
                      symbol.head,
                      symbol.hipWidth,
                      symbol.hipXOffset,
                      symbol.hipYOffset,
                      symbol.foot
                    ],
                    // Inject plugin metadata if it exists
                    metadata: (symbol.pluginMetadata['com.fraymakers.FraymakersMetadata']) ? {...symbol.pluginMetadata['com.fraymakers.FraymakersMetadata']} : {}
                  };
                }
              } else {
                currentKeyframe.symbol = null;
              }
            } else if (keyframe.type === 'POINT') {
              let symbolKeyframe = keyframe as IPointKeyframe;
    
              if (symbolKeyframe.symbol) {
                let symbol = _.find(spriteEntityMetadata.symbols, (entry) => entry.$id === symbolKeyframe.symbol) as IPointSymbol;
                if (!symbol) {
                  FrayToolsPluginCore.log('warn', `--------> Could not find point symbol id: ${symbolKeyframe.symbol}`);
                } else {
                  FrayToolsPluginCore.log('debug', '--------> Writing point symbol ' + symbolKeyframe.symbol + '...');
                  // Convert to slimmer data format
                  currentKeyframe.symbol = {
                    color: symbol.color,
                    data: [symbol.x, symbol.y, symbol.alpha, symbol.rotation],
                    // Inject plugin metadata if it exists
                    metadata: (symbol.pluginMetadata['com.fraymakers.FraymakersMetadata']) ? {...symbol.pluginMetadata['com.fraymakers.FraymakersMetadata']} : {}
                  };
                }
              } else {
                currentKeyframe.symbol = null;
              }
            } else if (keyframe.type === 'TILEMAP') {
              let symbolKeyframe = keyframe as ITilemapKeyframe;
    
              if (symbolKeyframe.symbol) {
                let symbol = _.find(spriteEntityMetadata.symbols, (entry) => entry.$id === symbolKeyframe.symbol) as ITilemapSymbol;
                if (!symbol) {
                  FrayToolsPluginCore.log('warn', `--------> Could not find tilemap symbol id: ${symbolKeyframe.symbol}`);
                } else {
                  FrayToolsPluginCore.log('debug', '--------> Writing tilemap symbol ' + symbolKeyframe.symbol + '...');
                  // Convert to slimmer data format
                  currentKeyframe.symbol = {
                    data: [symbol.x, symbol.y, symbol.alpha, symbol.pivotX, symbol.pivotY, symbol.rotation, symbol.scaleX, symbol.scaleY],
                    tiles: symbol.tiles,
                    // Inject plugin metadata if it exists
                    metadata: (symbol.pluginMetadata['com.fraymakers.FraymakersMetadata']) ? {...symbol.pluginMetadata['com.fraymakers.FraymakersMetadata']} : {}
                  };
                }
              } else {
                currentKeyframe.symbol = null;
              }
            }

            currentLayer.keyframes.push(currentKeyframe);

            // Now see if we need to insert additional frames if tweening is enabled
            if (keyframe_index <= layer.keyframes.length - 1 && (keyframe.type === 'IMAGE' || keyframe.type === 'COLLISION_BOX' || keyframe.type === 'POLYGON' || keyframe.type === 'LINE_SEGMENT' || keyframe.type === 'COLLISION_BODY' || keyframe.type === 'POINT' || keyframe.type === 'TILEMAP') && keyframe.tweened) {
              // Get the symbol on the next keyframe
              let symbolKeyframe = keyframe as BaseSymbolKeyframeTypes;
              let symbol = (symbolKeyframe && symbolKeyframe.symbol) ? _.find(spriteEntityMetadata.symbols, (entry) => entry.$id === symbolKeyframe.symbol) as BaseSymbolTypes : null;
              let nextKeyframe = _.find(spriteEntityMetadata.keyframes, (entry) => entry.$id === layer.keyframes[keyframe_index+1]) as BaseSymbolKeyframeTypes;
              let nextSymbol = (nextKeyframe && nextKeyframe.symbol) ? _.find(spriteEntityMetadata.symbols, (entry) => entry.$id === nextKeyframe.symbol) as BaseSymbolTypes : null;
              if (!nextSymbol) {
                // Attempt to wrap back around
                nextKeyframe = _.find(spriteEntityMetadata.keyframes, (entry) => entry.$id === layer.keyframes[0]) as BaseSymbolKeyframeTypes;
                nextSymbol = (nextKeyframe && nextKeyframe.symbol) ? _.find(spriteEntityMetadata.symbols, (entry) => entry.$id === nextKeyframe.symbol) as BaseSymbolTypes : null;
              }
              if (nextSymbol) {
                // Interpolate between this current symbol keyframe to the next one
                let previousKeyframeLength = currentKeyframe.length;
                currentKeyframe.length = 1;

                for (let i = 1; i < previousKeyframeLength; i++) {
                  let tweenedKeyframe = _.cloneDeep(currentKeyframe);

                  switch (symbol.type) {
                    case 'IMAGE':
                      {
                        // [symbol.x, symbol.y, symbol.alpha, symbol.pivotX, symbol.pivotY, symbol.rotation, symbol.scaleX, symbol.scaleY, sheetID, frameID]
                        let castedNextSymbol = nextSymbol as IImageSymbol;
                        let imageAsset = this.m_config.guidToAsset[symbol.imageAsset];
                        if (!imageAsset) {
                          FrayToolsPluginCore.log('warn', `--------> Missing image asset: ${symbol.imageAsset} in animation ${animation.name} keyframe: ${keyframe_index}. Will use placeholder...`);
                          imageAsset = {
                            bitmapData: MISSING_IMAGE,
                            metadata: {
                              version: 0,
                              guid: '__placeholder__',
                              id: '',
                              export: true,
                              tags: [],
                              plugins: [],
                              pluginMetadata: {}
                            },
                            filename: 'placeholder.png'
                          };
                        }

                        // Grab rotation and scale first
                        let rotationTweened = TweenUtil.interpolate(symbol.rotation, castedNextSymbol.rotation, i / (previousKeyframeLength), TweenType.toEaseValue(symbolKeyframe.tweenType));
                        let scaleXTweened = TweenUtil.interpolate(symbol.scaleX, castedNextSymbol.scaleX, i / (previousKeyframeLength), TweenType.toEaseValue(symbolKeyframe.tweenType));
                        let scaleYTweened = TweenUtil.interpolate(symbol.scaleY, castedNextSymbol.scaleY, i / (previousKeyframeLength), TweenType.toEaseValue(symbolKeyframe.tweenType));

                        // Position tween (Note: Need to take into account trim offset for X and Y)
                        let translation = TweenUtil.calculateTweenedSymbolPosition(symbol, castedNextSymbol, i / (previousKeyframeLength), symbolKeyframe.tweenType);
                        
                        // Get true X offset
                        let realX = translation.x + this.m_spriteFrameCache[spritesheetGroup][imageAsset.metadata.guid].trimOffset.x * scaleXTweened;
                        let realY = translation.y + this.m_spriteFrameCache[spritesheetGroup][imageAsset.metadata.guid].trimOffset.y * scaleYTweened;
                        
                        if (rotationTweened !== 0) {
                          let trimMagnitude = Point.distance(new Point(0, 0), new Point(this.m_spriteFrameCache[spritesheetGroup][imageAsset.metadata.guid].trimOffset.x * scaleXTweened, this.m_spriteFrameCache[spritesheetGroup][imageAsset.metadata.guid].trimOffset.y * scaleYTweened));
                          let pivotAngle = Math.atan2(
                            (this.m_spriteFrameCache[spritesheetGroup][imageAsset.metadata.guid].trimOffset.y * scaleYTweened - 0),
                            (this.m_spriteFrameCache[spritesheetGroup][imageAsset.metadata.guid].trimOffset.x * scaleXTweened - 0)
                          ) * 180 / Math.PI;
                          // Calculate offset to the trim based on the additional angle introduced by the symbol rotation
                          let cosA = Math.cos((Math.PI * (360 - (rotationTweened + pivotAngle))) / 180);
                          let sinA = Math.sin((Math.PI * (360 - (rotationTweened + pivotAngle))) / 180);

                          realX = translation.x + trimMagnitude * cosA;
                          realY = translation.y + trimMagnitude * -sinA;
                        }
                        tweenedKeyframe.symbol.data[0] = realX;
                        tweenedKeyframe.symbol.data[1] = realY;

                        // Alpha tween
                        tweenedKeyframe.symbol.data[2] = TweenUtil.interpolate(symbol.alpha, castedNextSymbol.alpha, i / (previousKeyframeLength), TweenType.toEaseValue(symbolKeyframe.tweenType));

                        // Pivot tween
                        tweenedKeyframe.symbol.data[3] = TweenUtil.interpolate(symbol.pivotX, castedNextSymbol.pivotX, i / (previousKeyframeLength), TweenType.toEaseValue(symbolKeyframe.tweenType));
                        tweenedKeyframe.symbol.data[4] = TweenUtil.interpolate(symbol.pivotY, castedNextSymbol.pivotY, i / (previousKeyframeLength), TweenType.toEaseValue(symbolKeyframe.tweenType));

                        // Rotation tween
                        tweenedKeyframe.symbol.data[5] = rotationTweened;

                        // Scale tween
                        tweenedKeyframe.symbol.data[6] = scaleXTweened;
                        tweenedKeyframe.symbol.data[7] = scaleYTweened;
                      }
                      break;
                    case 'COLLISION_BOX':
                      {
                        // [symbol.x, symbol.y, symbol.alpha, symbol.pivotX, symbol.pivotY, symbol.rotation, symbol.scaleX, symbol.scaleY]
                        let castedNextSymbol = nextSymbol as ICollisionBoxSymbol;

                        // Position tween
                        let translation = TweenUtil.calculateTweenedSymbolPosition(symbol, castedNextSymbol, i / (previousKeyframeLength), symbolKeyframe.tweenType);
                        tweenedKeyframe.symbol.data[0] = translation.x;
                        tweenedKeyframe.symbol.data[1] = translation.y;

                        // Alpha tween
                        tweenedKeyframe.symbol.data[2] = TweenUtil.interpolate(symbol.alpha, castedNextSymbol.alpha, i / (previousKeyframeLength), TweenType.toEaseValue(symbolKeyframe.tweenType));

                        // Pivot tween
                        tweenedKeyframe.symbol.data[3] = TweenUtil.interpolate(symbol.pivotX, castedNextSymbol.pivotX, i / (previousKeyframeLength), TweenType.toEaseValue(symbolKeyframe.tweenType));
                        tweenedKeyframe.symbol.data[4] = TweenUtil.interpolate(symbol.pivotY, castedNextSymbol.pivotY, i / (previousKeyframeLength), TweenType.toEaseValue(symbolKeyframe.tweenType));

                        // Rotation tween
                        tweenedKeyframe.symbol.data[5] = TweenUtil.interpolate(symbol.rotation, castedNextSymbol.rotation, i / (previousKeyframeLength), TweenType.toEaseValue(symbolKeyframe.tweenType));

                        // Scale tween
                        tweenedKeyframe.symbol.data[6] = TweenUtil.interpolate(symbol.scaleX, castedNextSymbol.scaleX, i / (previousKeyframeLength), TweenType.toEaseValue(symbolKeyframe.tweenType));
                        tweenedKeyframe.symbol.data[7] = TweenUtil.interpolate(symbol.scaleY, castedNextSymbol.scaleY, i / (previousKeyframeLength), TweenType.toEaseValue(symbolKeyframe.tweenType));
                      }
                      break;
                    case 'POINT':
                      {
                        // [symbol.x, symbol.y, symbol.alpha, symbol.rotation]
                        let castedNextSymbol = nextSymbol as IPointSymbol;

                        // Position tween
                        tweenedKeyframe.symbol.data[0] = TweenUtil.interpolate(symbol.x, castedNextSymbol.x, i / (previousKeyframeLength), TweenType.toEaseValue(symbolKeyframe.tweenType));
                        tweenedKeyframe.symbol.data[1] = TweenUtil.interpolate(symbol.y, castedNextSymbol.y, i / (previousKeyframeLength), TweenType.toEaseValue(symbolKeyframe.tweenType));

                        // Alpha tween
                        tweenedKeyframe.symbol.data[2] = TweenUtil.interpolate(symbol.alpha, castedNextSymbol.alpha, i / (previousKeyframeLength), TweenType.toEaseValue(symbolKeyframe.tweenType));
                        
                        // Rotation tween
                        tweenedKeyframe.symbol.data[3] = TweenUtil.interpolate(symbol.rotation, castedNextSymbol.rotation, i / (previousKeyframeLength), TweenType.toEaseValue(symbolKeyframe.tweenType));
                      }
                      break;
                    case 'POLYGON':
                      {
                        // [symbol.x, symbol.y, symbol.alpha, symbol.rotation]
                        let castedNextSymbol = nextSymbol as IPolygonSymbol;

                        // Position tween
                        tweenedKeyframe.symbol.data[0] = TweenUtil.interpolate(symbol.x, castedNextSymbol.x, i / (previousKeyframeLength), TweenType.toEaseValue(symbolKeyframe.tweenType));
                        tweenedKeyframe.symbol.data[1] = TweenUtil.interpolate(symbol.y, castedNextSymbol.y, i / (previousKeyframeLength), TweenType.toEaseValue(symbolKeyframe.tweenType));

                        // Alpha tween
                        tweenedKeyframe.symbol.data[2] = TweenUtil.interpolate(symbol.alpha, castedNextSymbol.alpha, i / (previousKeyframeLength), TweenType.toEaseValue(symbolKeyframe.tweenType));
                        
                        // Rotation tween
                        tweenedKeyframe.symbol.data[3] = TweenUtil.interpolate(symbol.rotation, castedNextSymbol.rotation, i / (previousKeyframeLength), TweenType.toEaseValue(symbolKeyframe.tweenType));
                      }
                      break;
                    case 'LINE_SEGMENT':
                      {
                        // [symbol.alpha]
                        let castedNextSymbol = nextSymbol as ILineSegmentSymbol;

                        // Alpha tween
                        tweenedKeyframe.symbol.data[0] = TweenUtil.interpolate(symbol.alpha, castedNextSymbol.alpha, i / (previousKeyframeLength), TweenType.toEaseValue(symbolKeyframe.tweenType));
                      }
                      break;
                    case 'COLLISION_BODY':
                      {
                        // [headPosition, hipWidth, hipXOffset, hipYOffset, footPosition]
                        let castedNextSymbol = nextSymbol as ICollisionBodySymbol;

                        tweenedKeyframe.symbol.data[0] = TweenUtil.interpolate(symbol.head, castedNextSymbol.head, i / (previousKeyframeLength), TweenType.toEaseValue(symbolKeyframe.tweenType));
                        tweenedKeyframe.symbol.data[1] = TweenUtil.interpolate(symbol.hipWidth, castedNextSymbol.hipWidth, i / (previousKeyframeLength), TweenType.toEaseValue(symbolKeyframe.tweenType));
                        tweenedKeyframe.symbol.data[2] = TweenUtil.interpolate(symbol.hipXOffset, castedNextSymbol.hipXOffset, i / (previousKeyframeLength), TweenType.toEaseValue(symbolKeyframe.tweenType));
                        tweenedKeyframe.symbol.data[3] = TweenUtil.interpolate(symbol.hipYOffset, castedNextSymbol.hipYOffset, i / (previousKeyframeLength), TweenType.toEaseValue(symbolKeyframe.tweenType));
                        tweenedKeyframe.symbol.data[4] = TweenUtil.interpolate(symbol.foot, castedNextSymbol.foot, i / (previousKeyframeLength), TweenType.toEaseValue(symbolKeyframe.tweenType));
                      }
                      break;
                    case 'TILEMAP':
                      {
                        // [symbol.x, symbol.y, symbol.alpha, symbol.pivotX, symbol.pivotY, symbol.rotation, symbol.scaleX, symbol.scaleY]
                        let castedNextSymbol = nextSymbol as ITilemapSymbol;

                        // Position tween
                        let translation = TweenUtil.calculateTweenedSymbolPosition(symbol, castedNextSymbol, i / (previousKeyframeLength), symbolKeyframe.tweenType);
                        tweenedKeyframe.symbol.data[0] = translation.x;
                        tweenedKeyframe.symbol.data[1] = translation.y;

                        // Alpha tween
                        tweenedKeyframe.symbol.data[2] = TweenUtil.interpolate(symbol.alpha, castedNextSymbol.alpha, i / (previousKeyframeLength), TweenType.toEaseValue(symbolKeyframe.tweenType));

                        // Pivot tween
                        tweenedKeyframe.symbol.data[3] = TweenUtil.interpolate(symbol.pivotX, castedNextSymbol.pivotX, i / (previousKeyframeLength), TweenType.toEaseValue(symbolKeyframe.tweenType));
                        tweenedKeyframe.symbol.data[4] = TweenUtil.interpolate(symbol.pivotY, castedNextSymbol.pivotY, i / (previousKeyframeLength), TweenType.toEaseValue(symbolKeyframe.tweenType));

                        // Rotation tween
                        tweenedKeyframe.symbol.data[5] = TweenUtil.interpolate(symbol.rotation, castedNextSymbol.rotation, i / (previousKeyframeLength), TweenType.toEaseValue(symbolKeyframe.tweenType));

                        // Scale tween
                        tweenedKeyframe.symbol.data[6] = TweenUtil.interpolate(symbol.scaleX, castedNextSymbol.scaleX, i / (previousKeyframeLength), TweenType.toEaseValue(symbolKeyframe.tweenType));
                        tweenedKeyframe.symbol.data[7] = TweenUtil.interpolate(symbol.scaleY, castedNextSymbol.scaleY, i / (previousKeyframeLength), TweenType.toEaseValue(symbolKeyframe.tweenType));
                      }
                      break;
                  }
                  
                  currentLayer.keyframes.push(tweenedKeyframe);
                }
              }
            }
          });
    
          currentAnimation.layers.push(currentLayer);
        });

        spriteEntityData.animations.push(currentAnimation);
      });
  }
  private setupNewSpriteSheet(spritesheetGroup:string): void {
    let spriteSheetWriteData:ISpriteSheetWriteData = {
      bitmapData: new BitmapData(Exporter.DEFAULT_SHEET_WIDTH, Exporter.DEFAULT_SHEET_HEIGHT, true, 0x00000000),
      cursor: new Point(0, 0),
      maxY: 0,
      frameIndex: 0,
      rects: [],
      groupId: spritesheetGroup,
      groupSheetIndex: (!this.m_spritesheetGroupMap[spritesheetGroup]) ? 0 : this.m_spritesheetGroupMap[spritesheetGroup].groupSheetIndex + 1 // Increment sheet index for this group
    };
    // Point group map to latest entry and add to master list
    this.m_spritesheetGroupMap[spritesheetGroup] = spriteSheetWriteData;
    this.m_spritesheetWriteDatas.push(spriteSheetWriteData);
  }
  private getOrWriteImageAssetToSheet(imageAsset: { metadata:ILibraryAssetMetadata, binaryData?:Uint8Array, byteArray?:ByteArray, bitmapData?:BitmapData, filename?:string }, spritesheetGroup:string): ISpriteFrame {
    this.m_spriteFrameCache[spritesheetGroup] = this.m_spriteFrameCache[spritesheetGroup] || {};
    let spriteFrame: ISpriteFrame = this.m_spriteFrameCache[spritesheetGroup][imageAsset.metadata.guid] || null;

    if (spriteFrame != null) {
      // We've already generated an ISpriteFrame object with this image and can re-use
      FrayToolsPluginCore.log('debug', `--------> Skipping ImageAsset duplicate: ${imageAsset.filename}`);

      // Return the cached frame
      return spriteFrame;
    }
    FrayToolsPluginCore.log('debug', `--------> Writing ImageAsset to sheet: ${imageAsset.filename}`);

    // Prepare to create a trimmed version of the asset
    let originalBitmapData: BitmapData = imageAsset.bitmapData;
    let tempBitmap:Bitmap = new Bitmap();
    tempBitmap.bitmapData = originalBitmapData;

    // Ready to capture Bitmap of this frame
    var boundsRect:Rectangle = SpriteUtil.getVisibleBounds(tempBitmap, tempBitmap);
    var topLeft:Point = new Point();

    // Padding (Always add additional pixels due to getBounds() clipping issue)
    // TODO: Confirm if padding is still necessary (was previously a SpriteSatchel thing)
    // boundsRect.offset( -Exporter.DEFAULT_SHEET_PADDING, -Exporter.DEFAULT_SHEET_PADDING);
    // boundsRect.width += Exporter.DEFAULT_SHEET_PADDING * 2 + 2;
    // boundsRect.height += Exporter.DEFAULT_SHEET_PADDING * 2 + 2;

    // Round down the bounds to prevent jitter
    boundsRect.x = Math.floor(boundsRect.x);
    boundsRect.y = Math.floor(boundsRect.y);

    // Set offset point relative to top left of untrimmed BitmapData
    topLeft.x = Math.round(boundsRect.x);
    topLeft.y = Math.round(boundsRect.y);

    if (boundsRect.width === 0 || boundsRect.height === 0) {
      // The BitmapData didn't contain any graphics, so we'll just make a blank pixel here
      boundsRect.width = 1;
      boundsRect.height = 1;
    }
    if (boundsRect.width > Exporter.MAX_SHEET_WIDTH) {
      FrayToolsPluginCore.log('warn', `Warning, image '${imageAsset.filename}' exceeds maximum sheet width`); 
      boundsRect.width = Exporter.MAX_SHEET_WIDTH;
    }
    if (boundsRect.height > Exporter.MAX_SHEET_HEIGHT) {
      FrayToolsPluginCore.log('warn', `Warning, image '${imageAsset.filename}' exceeds maximum sheet height`); 
      boundsRect.height =  Exporter.MAX_SHEET_HEIGHT;
    }

    // Get offset information (prevOffset refers to the position of the top left of the graphic within the MC bounds)
    var prevOffset:Point = new Point();
    prevOffset.x = boundsRect.x;
    prevOffset.y = boundsRect.y;
    var offset:Matrix = new Matrix();
    offset.tx = -prevOffset.x;
    offset.ty = -prevOffset.y;

    // Create the blank trimmed bitmap for the frame and draw into
    var trimmedBitmapData:BitmapData = new BitmapData(Math.ceil(boundsRect.width), Math.ceil(boundsRect.height), true, 0x00000000);
    trimmedBitmapData.draw(tempBitmap, offset, tempBitmap.transform.colorTransform, null, null, false);
    
    // On the off chance we have a sprite that has the EXACT same pixels as this one, we want to potentially save disk space and memory by referring back to that sprite instead
    // Basically what we're doing here is making the "location" of the current sprite on the sprite sheet the same as a pre-existing one if we find a duplicate bitmap
    this.m_bitmapDataCacheMap[spritesheetGroup] = this.m_bitmapDataCacheMap[spritesheetGroup] || {};
    this.m_bitmapDataCacheMap[spritesheetGroup][trimmedBitmapData.rect.width] = this.m_bitmapDataCacheMap[spritesheetGroup][trimmedBitmapData.rect.width] || {};
    this.m_bitmapDataCacheMap[spritesheetGroup][trimmedBitmapData.rect.width][trimmedBitmapData.rect.height] = this.m_bitmapDataCacheMap[spritesheetGroup][trimmedBitmapData.rect.width][trimmedBitmapData.rect.height] || [];
    let cachedBitmapDataList = this.m_bitmapDataCacheMap[spritesheetGroup][trimmedBitmapData.rect.width][trimmedBitmapData.rect.height];

    // So for each frame that may be a match with the current frame...
    for (let k = 0; k < cachedBitmapDataList.length; k++) {
      let currentSpriteFrame = cachedBitmapDataList[k];
      // Compare the pixels on each
      if (currentSpriteFrame.trimmedBitmapData.compare(trimmedBitmapData) == 0) {
        // Match was found, trash the newer bitmap we just created
        trimmedBitmapData.dispose();
        tempBitmap.bitmapData = null;
        tempBitmap = null;

        // Create the new sprite frame entry (re-using the data from the cached one)
        spriteFrame = {
          sheetIndex: currentSpriteFrame.sheetIndex,
          frameIndex: currentSpriteFrame.frameIndex,
          frameRect: currentSpriteFrame.frameRect,
          trimOffset: topLeft, // Note: We can't use the same trim offset here because although the frame was pixel for pixel the same, it was in a different location on the other PNG
          trimmedBitmapData: currentSpriteFrame.trimmedBitmapData
        };

        // Cache the image's sprite data
        this.m_spriteFrameCache[spritesheetGroup][imageAsset.metadata.guid] = spriteFrame;

        FrayToolsPluginCore.log('debug', `--------> Using duplicate sprite from cache: ${imageAsset.filename}`);

        return spriteFrame;
      }
    }

    // Now figure out where to place the bitmap data    
    if (!this.m_spritesheetGroupMap[spritesheetGroup]) {
      // Must be creating the first sprite sheet
      this.setupNewSpriteSheet(spritesheetGroup);
    }
    
    if (this.m_spritesheetGroupMap[spritesheetGroup].cursor.x + trimmedBitmapData.width > Exporter.MAX_SHEET_WIDTH) {
      // Move cursor to next row
      this.m_spritesheetGroupMap[spritesheetGroup].cursor.x = 0;
      this.m_spritesheetGroupMap[spritesheetGroup].cursor.y = this.m_spritesheetGroupMap[spritesheetGroup].maxY + Exporter.DEFAULT_SHEET_PADDING;
    }

    this.autoResizeSpritesheetBitmapData(spritesheetGroup, trimmedBitmapData);

    if (this.m_spritesheetGroupMap[spritesheetGroup].cursor.x + trimmedBitmapData.width > this.m_spritesheetGroupMap[spritesheetGroup].bitmapData.width || this.m_spritesheetGroupMap[spritesheetGroup].cursor.y + trimmedBitmapData.height > this.m_spritesheetGroupMap[spritesheetGroup].bitmapData.height) {
      // Sheet is out of space. Create a new sheet, resetting cursor and current frame index.
      this.setupNewSpriteSheet(spritesheetGroup);
      this.autoResizeSpritesheetBitmapData(spritesheetGroup, trimmedBitmapData);
    }

    // Actually write the image to the sheet
    this.m_spritesheetGroupMap[spritesheetGroup].bitmapData.copyPixels(trimmedBitmapData, new Rectangle(0, 0, trimmedBitmapData.width, trimmedBitmapData.height), this.m_spritesheetGroupMap[spritesheetGroup].cursor, null, null, true);

    // Create new sprite frame obj and cache
    spriteFrame = {
      sheetIndex: this.m_spritesheetGroupMap[spritesheetGroup].groupSheetIndex,
      frameIndex: this.m_spritesheetGroupMap[spritesheetGroup].frameIndex,
      frameRect: new Rectangle(this.m_spritesheetGroupMap[spritesheetGroup].cursor.x, this.m_spritesheetGroupMap[spritesheetGroup].cursor.y, trimmedBitmapData.width, trimmedBitmapData.height),
      trimOffset: topLeft,
      trimmedBitmapData: trimmedBitmapData
    };
    this.m_spriteFrameCache[spritesheetGroup][imageAsset.metadata.guid] = spriteFrame;

    // Add Rect to ordered list
    this.m_spritesheetGroupMap[spritesheetGroup].rects.push(spriteFrame.frameRect);

    // Set the new max to whatever's larger, the old one or the current cursor plus the bitmap's size
    this.m_spritesheetGroupMap[spritesheetGroup].maxY = Math.floor(Math.max(this.m_spritesheetGroupMap[spritesheetGroup].maxY, this.m_spritesheetGroupMap[spritesheetGroup].cursor.y + trimmedBitmapData.height));

    // Move the cursor to the right the length of the current bitmap's width
    this.m_spritesheetGroupMap[spritesheetGroup].cursor.x += trimmedBitmapData.width + Exporter.DEFAULT_SHEET_PADDING;

    // Bump current frame index
    this.m_spritesheetGroupMap[spritesheetGroup].frameIndex++;

    // Cache the sprite frame
    cachedBitmapDataList.push(spriteFrame);
    
    // Cleanup
    tempBitmap.bitmapData = null;
    tempBitmap = null;

    return spriteFrame;
  }
  /**
   * Helper method to resize a spritesheet based on the current cursor position and maximum allotted dimensions.
   * @param spritesheetGroup Group id of the spritesheet actively being written to for this call
   * @param bitmapData Bitmap data to be written
   */
  private autoResizeSpritesheetBitmapData(spritesheetGroup:string, bitmapData:BitmapData) {
    while (this.m_spritesheetGroupMap[spritesheetGroup].cursor.x + bitmapData.width > this.m_spritesheetGroupMap[spritesheetGroup].bitmapData.width && this.m_spritesheetGroupMap[spritesheetGroup].cursor.x + bitmapData.width < Exporter.MAX_SHEET_WIDTH) {
      // Cursor X exceeded sheet width. Attempt resize by creating a new BitmapData with double the sheet width
      let resizedSheet = new BitmapData(this.m_spritesheetGroupMap[spritesheetGroup].bitmapData.width * 2, this.m_spritesheetGroupMap[spritesheetGroup].bitmapData.height, true, 0x00000000);
      resizedSheet.copyPixels(this.m_spritesheetGroupMap[spritesheetGroup].bitmapData, this.m_spritesheetGroupMap[spritesheetGroup].bitmapData.rect, new Point(), null, null, true);
      this.m_spritesheetGroupMap[spritesheetGroup].bitmapData.dispose();
      this.m_spritesheetGroupMap[spritesheetGroup].bitmapData = resizedSheet;
    }
    while (this.m_spritesheetGroupMap[spritesheetGroup].cursor.y + bitmapData.height > this.m_spritesheetGroupMap[spritesheetGroup].bitmapData.height && this.m_spritesheetGroupMap[spritesheetGroup].cursor.y + bitmapData.height < Exporter.MAX_SHEET_HEIGHT) {
      // Cursor Y exceeded sheet width. Attempt resize by creating a new BitmapData with double the sheet height
      let resizedSheet = new BitmapData(this.m_spritesheetGroupMap[spritesheetGroup].bitmapData.width, this.m_spritesheetGroupMap[spritesheetGroup].bitmapData.height * 2, true, 0x00000000);
      resizedSheet.copyPixels(this.m_spritesheetGroupMap[spritesheetGroup].bitmapData, this.m_spritesheetGroupMap[spritesheetGroup].bitmapData.rect, new Point(), null, null, true);
      this.m_spritesheetGroupMap[spritesheetGroup].bitmapData.dispose();
      this.m_spritesheetGroupMap[spritesheetGroup].bitmapData = resizedSheet;
    }
  }
  public toByteArray(): Promise<ByteArray> {
    // Reset caches and bytes
    this.m_spriteFrameCache = {};
    this.m_bitmapDataCacheMap = {};
    this.m_spritesheetWriteDatas = [];
    this.m_spritesheetGroupMap = {};
    this.m_binaryData = new ByteArray();
    this.m_binaryData.endian = Endian.BIG_ENDIAN;

    let jsonData:IResourceData = {
      version: ASSET_VERSION,
      spritesheets: [],
      images: [],
      audio: [],
      binary: [],
      scripts: [],
      entities: [],
      nineSlices: []
    };
    let tmpByteArray: ByteArray = null;
    
    // For progress bar tracking
    let processedSpriteEntities = 0;
    let processedAnimations = 0;
    let processedMedia = 0;
    let totalFilteredSpriteEntities = 0;
    let totalAnimations = 0;
    let totalMedia = this.m_config.imageAssets.length + this.m_config.audioAssets.length;

    // Clear out un-exported sprite entities so it doesn't affect progress bar
    let filteredSpriteEntities = _.filter(this.m_config.spriteEntityAssets, (metadata) => {
      if (!metadata.export) {
        FrayToolsPluginCore.log('debug', `--> Skipping sprite entity not marked for export: ${this.m_config.guidToAsset[metadata.guid].filename}...`);

        return false;
      } else if (!metadata.id) {
        FrayToolsPluginCore.log('warn', `--> Skipping sprite entity lacking an id: ${this.m_config.guidToAsset[metadata.guid].filename}...`);

        return false;
      }

      totalFilteredSpriteEntities++;
      totalAnimations += metadata.animations.length;

      return true;
    });

    // First load all media and convert any Array Buffers to ByteArrays
    return Promise.all(_.map(this.m_config.imageAssets, (asset, index) => {
      this.m_config.guidToAsset[asset.guid].byteArray = arrayBufferToByteArray(this.m_config.guidToAsset[asset.guid].binaryData);
      var timeout = setTimeout(() => {
        FrayToolsPluginCore.log('log', 'Failed to proecss asset: ' + this.m_config.guidToAsset[asset.guid].filename);
      }, 5000);

      return new Promise<void>((resolve, reject) => {
        // Hack since BitmapData.frombytes() doesn't work consistently across platforms for some reason...
        let m_bitmapData = new BitmapData(1, 1);
        let loader: Loader = new Loader();
        loader.contentLoaderInfo.addEventListener(Event.COMPLETE, () => {
          clearTimeout(timeout);
          m_bitmapData = new BitmapData(Math.floor(loader.width), Math.floor(loader.height), true, 0x00000000);
          m_bitmapData.draw(loader);
          this.m_config.guidToAsset[asset.guid].bitmapData = m_bitmapData;

          processedMedia++;
          this.m_config.onProgress(Math.round(100 * ((processedMedia / totalMedia * ProgressRatios.media))));

          resolve();
        });
        loader.loadBytes(this.m_config.guidToAsset[asset.guid].byteArray);
      });
    }))
      .then(() => {
        // Convert binary assets to ByteArrays as well
        return Promise.all(_.map(this.m_config.binaryAssets, (asset) => {
          this.m_config.guidToAsset[asset.guid].byteArray = arrayBufferToByteArray(this.m_config.guidToAsset[asset.guid].binaryData);
        }))
      })
      .then(() => {
        _.map(this.m_config.audioAssets, (asset) => {
          this.m_config.guidToAsset[asset.guid].byteArray = arrayBufferToByteArray(this.m_config.guidToAsset[asset.guid].binaryData);
          
          processedMedia++;
          // Note: Consider asynchronous version of arrayBufferToByteArray()
          this.m_config.onProgress(Math.round(100 * ((processedMedia / totalMedia * ProgressRatios.media))));
        });
      })
      .then(() => {
        let currentEntityIndex:number = 0;
        let currentAnimationIndex:number = 0;
        let spritesheetGroup:string = 'default';

        if (filteredSpriteEntities.length <= 0) {
          return;
        }

        // SpriteEntity Prep
        FrayToolsPluginCore.log('log', 'Writing SpriteEntity objects...');

        var nextEntity = (spriteEntityGroupId:string) => {
          currentAnimationIndex = 0;

          var nextAnimation = () => {
            // Start processing the next animation and resolve afterward
            return this.processAnimation(spriteEntityData, spriteEntityMetadata, spriteEntityMetadata.animations[currentAnimationIndex], spriteEntityGroupId)
              .then(() => {
                // Force delay to free up redraw
                return new Promise((resolve) => {
                  setTimeout(resolve, 0);
                });
              })
              .then(() => {
                processedAnimations++;
                this.m_config.onProgress(Math.round(100 * (ProgressRatios.media + (processedAnimations / totalAnimations * ProgressRatios.animations))));

                if (currentAnimationIndex < spriteEntityMetadata.animations.length - 1) {
                  currentAnimationIndex++;

                  // Start processing the next animation recursively
                  return nextAnimation();
                } else {
                  // No more animations remain
                }
              });
          };

          let spriteEntityMetadata = filteredSpriteEntities[currentEntityIndex];

          // Inject spritesheet and entity data
          FrayToolsPluginCore.log('debug', 'Generating sprites: ' + spriteEntityMetadata.id);

          // Inject version, guid, spritesheets array, etc.
          let spriteEntityData: ISpriteEntityData = {
            id: spriteEntityMetadata.id,
            version: spriteEntityMetadata.version,
            guid: spriteEntityMetadata.guid,
            animations: [],
            tags: spriteEntityMetadata.tags,
            // Inject plugin metadata if it exists
            metadata: (spriteEntityMetadata.pluginMetadata['com.fraymakers.FraymakersMetadata']) ? {...spriteEntityMetadata.pluginMetadata['com.fraymakers.FraymakersMetadata']} : {}
          };

          jsonData.entities.push(spriteEntityData);
          
          return nextAnimation()
            .then(() => {
              // Force delay to free up redraw
              return new Promise((resolve) => {
                setTimeout(resolve, 0);
              });
            })
            .then(() => {
              if (currentEntityIndex < filteredSpriteEntities.length - 1) {
                FrayToolsPluginCore.log('log', '--> Added sprite entity data: ' + spriteEntityMetadata.id + '...');

                // Start processing the next entity recursively
                currentEntityIndex++;
                spritesheetGroup = (filteredSpriteEntities[currentEntityIndex].pluginMetadata['com.fraymakers.FraymakersMetadata']) ? filteredSpriteEntities[currentEntityIndex].pluginMetadata['com.fraymakers.FraymakersMetadata'].spritesheetGroup || 'default' : 'default';
                return nextEntity(spritesheetGroup);
              } else {
                // No more entities or animations remain
                FrayToolsPluginCore.log('log', '--> Added sprite entity data: ' + spriteEntityMetadata.id + '...');
              }
            })
            .then(() => {
              processedSpriteEntities++;
              this.m_config.onProgress(Math.round(100 * (ProgressRatios.media + (processedAnimations / totalAnimations * ProgressRatios.animations))));
            });
        };
    
        spritesheetGroup = (filteredSpriteEntities[currentEntityIndex].pluginMetadata['com.fraymakers.FraymakersMetadata']) ? filteredSpriteEntities[currentEntityIndex].pluginMetadata['com.fraymakers.FraymakersMetadata'].spritesheetGroup || 'default' : 'default';


        return nextEntity(spritesheetGroup);
      })
      .then(() => {
        FrayToolsPluginCore.log('log', 'Writing scripts objects...');

        // Write scripts
        for (let i = 0; i < this.m_config.scriptAssets.length; i++) {
          let scriptAssetMetdata = this.m_config.scriptAssets[i];
          if (!scriptAssetMetdata.export) {
            FrayToolsPluginCore.log('debug', `--> Skipping script not marked for export: ${this.m_config.guidToAsset[scriptAssetMetdata.guid].filename}...`);
            continue;
          } else if (!scriptAssetMetdata.id) {
            FrayToolsPluginCore.log('warn', `--> Skipping script lacking an id: ${this.m_config.guidToAsset[scriptAssetMetdata.guid].filename}...`);
            continue;
          }
  
          jsonData.scripts.push({
            version: scriptAssetMetdata.version,
            id: scriptAssetMetdata.id,
            guid: scriptAssetMetdata.guid,
            value: scriptAssetMetdata.script,
            language: scriptAssetMetdata.language || (/.hx$/g.test(this.m_config.guidToAsset[scriptAssetMetdata.guid].filename) ? 'hscript' : null),
            tags: scriptAssetMetdata.tags,
            // Inject plugin metadata if it exists
            metadata: (scriptAssetMetdata.pluginMetadata['com.fraymakers.FraymakersMetadata']) ? {...scriptAssetMetdata.pluginMetadata['com.fraymakers.FraymakersMetadata']} : {}
          });
  
          FrayToolsPluginCore.log('log', '--> Added script: ' + scriptAssetMetdata.id + '...');
        }
        
        // Write palettes
        FrayToolsPluginCore.log('log', 'Writing palette collection data...');

        // Write palette collection data as JSON script data
        _.each(this.m_config.paletteCollectionAssets, (paletteCollection) => {
          if (!paletteCollection.export) {
            FrayToolsPluginCore.log('warn', `--> Skipping palette collection not marked for export: ${this.m_config.guidToAsset[paletteCollection.guid].filename}...`);
            return;
          } else if (!paletteCollection.export) {
            FrayToolsPluginCore.log('debug', `--> Skipping palette collection not marked for export: ${this.m_config.guidToAsset[paletteCollection.guid].filename}...`);
            return;
          } else if (!paletteCollection.id) {
            FrayToolsPluginCore.log('warn', `--> Skipping palette collection lacking an id: ${this.m_config.guidToAsset[paletteCollection.guid].filename}...`);
            return;
          }
          // TODO: Need to implement proper Red, Blue, Green, and Default markings from FM metadata plugin
          let paletteData:IFraymakersPaletteData = {
            indexed: {
              base: -1,
              red: -1,
              green: -1,
              blue: -1
            },
            palettes: []
          };
          
          let paletteCollectionAsset = this.m_config.guidToAsset[paletteCollection.guid].metadata as IPaletteCollectionAssetMetadata;
          // Add each palette map to the palette data
          _.each(paletteCollectionAsset.maps, (paletteMap, index) => {
            // Create a hash map of source color to target color
            let colorMap:{[sourceColor:string]: string;} = {};

            
            _.each(paletteMap.colors, (paletteMapColorData) => {
              let sourceColor = _.find(paletteCollectionAsset.colors, (color) => color.$id === paletteMapColorData.paletteColorId);
              if (sourceColor) {
                colorMap[sourceColor.color] = paletteMapColorData.targetColor;
              }
            });

            // Now we can add this palette map to the list of palettes
            let entry:IFraymakersPaletteMapEntry = { name: paletteMap.name, colors: colorMap };
            paletteData.palettes.push(entry);

            // Deal with indexing
            if (paletteMap.pluginMetadata['com.fraymakers.FraymakersMetadata'] && paletteMap.pluginMetadata['com.fraymakers.FraymakersMetadata'].isBase) {
              paletteData.indexed.base = index;
            }
            if (paletteMap.pluginMetadata['com.fraymakers.FraymakersMetadata'] && paletteMap.pluginMetadata['com.fraymakers.FraymakersMetadata'].teamColor) {
              if (paletteMap.pluginMetadata['com.fraymakers.FraymakersMetadata'].teamColor === 'RED') {
                paletteData.indexed.red = index;
              } else if (paletteMap.pluginMetadata['com.fraymakers.FraymakersMetadata'].teamColor === 'GREEN') {
                paletteData.indexed.green = index;
              } else if (paletteMap.pluginMetadata['com.fraymakers.FraymakersMetadata'].teamColor === 'BLUE') {
                paletteData.indexed.blue = index;
              }
            }
          });

          jsonData.scripts.push({
            version: paletteCollection.version,
            id: paletteCollection.id,
            guid: paletteCollection.guid,
            tags: paletteCollection.tags,
            language: 'json',
            value: JSON.stringify(paletteData),
            metadata: {}
          });

          FrayToolsPluginCore.log('log', '--> Added palette collection script: ' + paletteCollection.id + '...');
        });
        
        // Write 9-slices
        FrayToolsPluginCore.log('log', 'Writing nine slice assets...');
        _.each(this.m_config.nineSliceAssets, (nineSlice) => {
          if (!nineSlice.export) {
            FrayToolsPluginCore.log('warn', `--> Skipping nine slice not marked for export: ${this.m_config.guidToAsset[nineSlice.guid].filename}...`);
            return;
          } else if (!nineSlice.id) {
            FrayToolsPluginCore.log('warn', `--> Skipping nine slice lacking an id: ${this.m_config.guidToAsset[nineSlice.guid].filename}...`);
            return;
          }

          let spritesheetGroup:string = (nineSlice.pluginMetadata['com.fraymakers.FraymakersMetadata']) ? nineSlice.pluginMetadata['com.fraymakers.FraymakersMetadata'].spritesheetGroup || 'default' : 'default';
          let cachedSpriteFrame = this.getOrWriteImageAssetToSheet(this.m_config.guidToAsset[nineSlice.imageAsset], spritesheetGroup);

          jsonData.nineSlices.push({
            version: nineSlice.version,
            id: nineSlice.id,
            guid: nineSlice.guid,
            tags: nineSlice.tags,
            sheetIndex: cachedSpriteFrame.sheetIndex,
            frameIndex: cachedSpriteFrame.frameIndex,
            borderLeft: nineSlice.borderLeft,
            borderTop: nineSlice.borderTop,
            borderRight: nineSlice.borderRight,
            borderBottom: nineSlice.borderBottom
          });
          FrayToolsPluginCore.log('log', '--> Added nine slice data: ' + nineSlice.id + '...');
        });
    
        // Write spritesheets, images, and audio (in that order)
        FrayToolsPluginCore.log('log', 'Writing binary spritesheet data...');
        for (let i = 0; i < this.m_spritesheetWriteDatas.length; i++) {
          tmpByteArray = this.m_spritesheetWriteDatas[i].bitmapData.encode(this.m_spritesheetWriteDatas[i].bitmapData.rect, new PNGEncoderOptions(false));
          let oldLength = tmpByteArray.length;
          
          if (this.m_config.pngCompression) {
            // Compress the PNG further
            let buffer:Buffer = Buffer.alloc(tmpByteArray.length);
            tmpByteArray.position = 0;
            for (let j = 0; j < tmpByteArray.length; j++) {
              buffer.writeInt8(tmpByteArray.readByte(), j);
            }
            let png = PNG.sync.read(buffer);
            // Compression strategy: https://stackoverflow.com/a/27269260
            let compressedBuffer = PNG.sync.write(png, { filterType: 2, deflateStrategy: 0, deflateLevel: 9 });

            // Replace original bytes with compressed bytes
            tmpByteArray = ByteArray.fromArrayBuffer(compressedBuffer.buffer);
          }

          let frameRects: Rectangle[] = this.m_spritesheetWriteDatas[i].rects;
          let frameRectData: number[] = [];
    
          // Copy rect data to a flat number array
          for (let j = 0; j < frameRects.length; j++) {
            //  x, y, width, height
            frameRectData.push(Math.floor(frameRects[j].x));
            frameRectData.push(Math.floor(frameRects[j].y));
            frameRectData.push(Math.floor(frameRects[j].width));
            frameRectData.push(Math.floor(frameRects[j].height));
          }
    
          // Add the spritesheet to the list
          jsonData.spritesheets.push({
            version: Exporter.SPRITESHEET_VERSION,
            bytesOffset: this.m_binaryData.position,
            bytesLength: tmpByteArray.length,
            frames: frameRectData,
            group: this.m_spritesheetWriteDatas[i].groupId
          });
    
          // Write binary data
          this.m_binaryData.writeBytes(tmpByteArray);
    
          FrayToolsPluginCore.log('log', '--> Wrote sprite sheet no. ' + i + `, group: ${this.m_spritesheetWriteDatas[i].groupId} (compressed ${oldLength}->${tmpByteArray.length}) bytes`);
        }
    
        FrayToolsPluginCore.log('log', 'Writing binary image data...');
        for (let i = 0; i < this.m_config.imageAssets.length; i++) {
          let imageMetadata = this.m_config.imageAssets[i];
          if (!imageMetadata.export) {
            FrayToolsPluginCore.log('debug', `--> Skipping image not marked for export: ${this.m_config.guidToAsset[imageMetadata.guid].filename}...`);
            continue;
          } else if (!imageMetadata.id) {
            FrayToolsPluginCore.log('warn', `--> Skipping image lacking an id: ${this.m_config.guidToAsset[imageMetadata.guid].filename}...`);
            continue;
          }
          let imageAssetBytes = this.m_config.guidToAsset[imageMetadata.guid].byteArray;
  
          jsonData.images.push({
            version: imageMetadata.version,
            id: imageMetadata.id,
            guid: imageMetadata.guid,
            bytesOffset: this.m_binaryData.position,
            bytesLength: imageAssetBytes.length,
            tags: imageMetadata.tags,
            // Inject plugin metadata if it exists
            metadata: (imageMetadata.pluginMetadata['com.fraymakers.FraymakersMetadata']) ? {...imageMetadata.pluginMetadata['com.fraymakers.FraymakersMetadata']} : {}
          });
  
          // Write binary data
          this.m_binaryData.writeBytes(imageAssetBytes);
          FrayToolsPluginCore.log('log', `--> Wrote image: ${this.m_config.guidToAsset[imageMetadata.guid].filename} (${imageAssetBytes.length}) bytes`);
        }
    
        FrayToolsPluginCore.log('log', 'Writing binary audio data...');
        for (let i = 0; i < this.m_config.audioAssets.length; i++) {
          let audioMetadata = this.m_config.audioAssets[i];
          if (!audioMetadata.export) {
            FrayToolsPluginCore.log('debug', `--> Skipping audio not marked for export: ${this.m_config.guidToAsset[audioMetadata.guid].filename}...`);
            continue;
          } else if (!audioMetadata.id) {
            FrayToolsPluginCore.log('warn', `--> Skipping audio lacking an id: ${this.m_config.guidToAsset[audioMetadata.guid].filename}...`);
            continue;
          }
          let audioAssetBytes = this.m_config.guidToAsset[audioMetadata.guid].byteArray;
          let dotIndex = this.m_config.guidToAsset[audioMetadata.guid].filename.lastIndexOf('.');
          let extension = (dotIndex >= 0) ? this.m_config.guidToAsset[audioMetadata.guid].filename.substr(dotIndex + 1) : '';
  
          jsonData.audio.push({
            version: audioMetadata.version,
            id: audioMetadata.id,
            guid: audioMetadata.guid,
            format: extension,
            bytesOffset: this.m_binaryData.position,
            bytesLength: audioAssetBytes.length,
            tags: audioMetadata.tags,
            // Inject plugin metadata if it exists
            metadata: (audioMetadata.pluginMetadata['com.fraymakers.FraymakersMetadata']) ? {...audioMetadata.pluginMetadata['com.fraymakers.FraymakersMetadata']} : {}
          });
  
          // Write binary data
          this.m_binaryData.writeBytes(audioAssetBytes);
          FrayToolsPluginCore.log('log', `--> Wrote audio: ${this.m_config.guidToAsset[audioMetadata.guid].filename} (${audioAssetBytes.length} bytes)`);
        }
    
        FrayToolsPluginCore.log('log', 'Writing other binary data...');
        for (let i = 0; i < this.m_config.binaryAssets.length; i++) {
          let binaryMetadata = this.m_config.binaryAssets[i];
          if (!binaryMetadata.export) {
            FrayToolsPluginCore.log('debug', `--> Skipping binary not marked for export: ${this.m_config.guidToAsset[binaryMetadata.guid].filename}...`);
            continue;
          } else if (!binaryMetadata.id) {
            FrayToolsPluginCore.log('warn', `--> Skipping binary lacking an id: ${this.m_config.guidToAsset[binaryMetadata.guid].filename}...`);
            continue;
          }
          let binaryAssetBytes = this.m_config.guidToAsset[binaryMetadata.guid].byteArray;
  
          jsonData.binary.push({
            version: binaryMetadata.version,
            id: binaryMetadata.id,
            guid: binaryMetadata.guid,
            bytesOffset: this.m_binaryData.position,
            bytesLength: binaryAssetBytes.length,
            tags: binaryMetadata.tags,
            // Inject plugin metadata if it exists
            metadata: (binaryMetadata.pluginMetadata['com.fraymakers.FraymakersMetadata']) ? {...binaryMetadata.pluginMetadata['com.fraymakers.FraymakersMetadata']} : {}
          });
  
          // Write binary data
          this.m_binaryData.writeBytes(binaryAssetBytes);
          FrayToolsPluginCore.log('log', `--> Wrote binary data: ${this.m_config.guidToAsset[binaryMetadata.guid].filename} (${binaryAssetBytes.length} bytes)`);
        }
          
        // Convert JSON to text and write to byte array
        let jsonText = null;
        if (this.m_config.exportFormat === 'base64') {
          jsonText = Base64.encode(stringify(jsonData, {}));
        } else if (this.m_config.exportFormat === 'prettify') {
          jsonText = stringify(jsonData, { space: '  ' });
        } else {
          jsonText = stringify(jsonData, {});
        }

        let jsonBytes:ByteArray = new ByteArray();
        jsonBytes.writeUTFBytes(jsonText);
    
        // Merge json data with binary data
        let combinedByteArray: ByteArray = new ByteArray();
        combinedByteArray.endian = Endian.BIG_ENDIAN;
        combinedByteArray.writeUnsignedInt(jsonBytes.length);
        combinedByteArray.writeBytes(jsonBytes);
        combinedByteArray.writeBytes(this.m_binaryData);

        // Clean up cached memory
        _.each(this.m_spriteFrameCache, (group) => {
          _.each(group, (spriteFrame) => {
            spriteFrame.trimmedBitmapData.dispose();
          });
        });
        _.each(this.m_spritesheetWriteDatas, (spritesheetWriteData) => {
          spritesheetWriteData.bitmapData.dispose();
        });
        this.m_spriteFrameCache = null;
        this.m_bitmapDataCacheMap = null;
        this.m_spritesheetWriteDatas = null;
        this.m_spritesheetGroupMap = null;
        this.m_binaryData = null;
        
        // TODO: Consider breaking up byte array processing into asynchronous methods
        this.m_config.onProgress(Math.round(100 * (ProgressRatios.media + ProgressRatios.animations + ProgressRatios.write)));
        
        return combinedByteArray;
      });
  }
}
