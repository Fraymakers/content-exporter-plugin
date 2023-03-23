import { IManifestJson, IPluginConfig } from '@fraytools/plugin-core/lib/types';
import { JsonExportFormat } from "./Exporter";

// Typedef stuff
export interface IFraymakersContentExporterConfig extends IPluginConfig {
  jsonCompression:JsonExportFormat,
  pngCompression:boolean
}
export type FraymakersManifestContentType = 'character' | 'projectile' | 'customGameObject' | 'stage' | 'platform' | 'music' | '';
export interface IFraymakersManifestContent {
  id:string;
  name:string;
  description:string;
  type:FraymakersManifestContentType;
}
export interface IFraymakersManifestGameObjectContent extends IFraymakersManifestContent {
  objectStatsId:string;
  animationStatsId:string;
  hitboxStatsId:string;
  costumesId:string;
  scriptId:string;
}
export interface IFraymakersManifestCharacterContent extends IFraymakersManifestGameObjectContent {
  type: 'character';
}
export interface IFraymakersManifestProjectileContent extends IFraymakersManifestGameObjectContent {
  type: 'projectile';
}
export interface IFraymakersManifestCustomGameObjectContent extends IFraymakersManifestGameObjectContent {
  type: 'customGameObject';
}
export interface IFraymakersManifestStageContent extends IFraymakersManifestContent {
  type: 'stage';
  scriptId:string;
  musicIds:{
    resourceId:string;
    contentId:string;
  }[];
}
export interface IFraymakersManifestPlatformContent extends IFraymakersManifestContent {
  type: 'platform';
  scriptId:string;
}
export interface IFraymakersManifestMusicContent extends IFraymakersManifestContent {
  type: 'music';
  audioId:string;
  loopPoint: number;
}
export interface IFraymakersManifest {
  resourceId:string;
  content:FraymakersManifestContentTypes[];
}
export type FraymakersManifestContentTypes = IFraymakersManifestContent | IFraymakersManifestCharacterContent | IFraymakersManifestProjectileContent | IFraymakersManifestCustomGameObjectContent | IFraymakersManifestMusicContent;

export interface IFraymakersPaletteData {
  indexed: {
    base:number;
    red:number;
    green:number;
    blue:number;
  };
  palettes:IFraymakersPaletteMapEntry[];
}

export interface IFraymakersPaletteMapEntry {
  name: string;
  colors: {
    [sourceColor:string]: string;
  };
}
