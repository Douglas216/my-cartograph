import type {LayerSpecification} from 'maplibre-gl';
import {riverCasing,riverLine,riverLabel} from './physicalLayers';
export const canalLayers:LayerSpecification[]=[
 {...riverCasing,id:'canal-casing',source:'canals'} as LayerSpecification,
 {...riverLine,id:'canal-line',source:'canals'} as LayerSpecification,
 {id:'canal-hit',type:'line',source:'canals',minzoom:3,paint:{'line-width':16,'line-opacity':0}},
 {...riverLabel,id:'canal-label',source:'canals'} as LayerSpecification,
];
const none=['==',['get','name'],'__none__'] as never;
export const canalHighlights:LayerSpecification[]=[
 {id:'canal-highlight-glow',type:'line',source:'canals',filter:none,paint:{'line-color':'#ffcf3f','line-width':10,'line-blur':4}},
 {id:'canal-highlight',type:'line',source:'canals',filter:none,paint:{'line-color':'#b47a0d','line-width':4}},
];
