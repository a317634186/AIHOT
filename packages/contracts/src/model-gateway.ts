// Administrator-visible metadata only. API keys and encrypted credentials are never part of this type.
export type GatewaySlot='default'|'primary'|'secondary';
export interface GatewayFields {
 baseUrl:string;defaultModelId:string;primaryModelId:string;secondaryModelId:string;
 searchSlot:GatewaySlot;reviewSearchSlot:GatewaySlot;reviewFallbackSlot:GatewaySlot;jsonMode:boolean;
}
export interface GatewayOverview extends GatewayFields {
 source:'environment'|'admin';apiKeyConfigured:boolean;revision:number;updatedAt:string|null;
}
export interface GatewayInput extends GatewayFields {apiKey?:string;revision:number;reason:string}
