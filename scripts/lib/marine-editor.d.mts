import type { FeatureCollection, Polygon, MultiPolygon, Position } from 'geojson';
export type MarineGeometry=Polygon|MultiPolygon;
export interface Boundary {id:string;points:Position[];handles:Position[];coastal:boolean[]}
export interface CoastMatch {id:number;i:number;t:number;point:Position;d:number}
export interface CoastIndex {nearest(point:Position,radius?:number):CoastMatch|null;rings:unknown[]}
export function coastlineIndex(land:FeatureCollection):CoastIndex;
export function boundaries(geometry:MarineGeometry,index:CoastIndex):Boundary[];
export function fingerprint(geometry:MarineGeometry):string;
export function editGeometry(base:MarineGeometry,definitions:Boundary[],edits:Record<string,Position[]>,land:FeatureCollection,index?:CoastIndex):{geometry:MultiPolygon;edits:Record<string,Position[]>};
