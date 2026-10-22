/** Typings for the standalone Castro Globe Canvas 2D implementation. */
export interface Marker {
  lat: number;
  lon: number;
  id?: string;
  label?: string;
  color?: string;
  count?: number;
  size?: number;
  [key: string]: unknown;
}
export interface ClusterMarker extends Marker {
  cluster: true;
  markers: Marker[];
}
export type Arc = {
  from: { lat: number; lon: number };
  to: { lat: number; lon: number };
  color?: string;
  headColor?: string;
  width?: number;
  duration?: number;
  animate?: boolean;
};
export interface GlobeTheme {
  ocean?: [string, string];
  land?: string;
  border?: string;
  graticule?: string;
  arc?: string;
  label?: string;
  labelStroke?: string;
  showGraticule?: boolean;
  shadeStrength?: number;
  stars?: string;
  marker?: string;
}
export interface GlobeOptions {
  center?: { lat: number; lon: number };
  theme?: GlobeTheme;
  transparentBackground?: boolean;
  autoRotate?: boolean;
  rotateSpeed?: number;
  zoomable?: boolean;
  maxZoom?: number;
  interactive?: boolean;
  stars?: boolean;
  graticule?: boolean;
  shade?: boolean;
  labels?: boolean | 'markers';
  markers?: Marker[];
  arcs?: Arc[];
  mode?: 'globe';
  landStyle?: 'outline' | 'fill';
  orbits?: number;
  renderMarker?: (
    ctx: CanvasRenderingContext2D,
    marker: Marker | ClusterMarker,
    info: { x: number; y: number; depth: number; scale: number; globe: CastroGlobe }
  ) => number | void;
  onClick?: (marker: Marker | ClusterMarker, point: {x: number; y: number}) => void;
}
export declare class CastroGlobe {
  constructor(canvas: HTMLCanvasElement, options?: GlobeOptions);
  readonly canvas: HTMLCanvasElement;
  zoom: number;
  lon: number;
  lat: number;
  setMarkers(markers: Marker[]): this;
  setArcs(arcs: Arc[]): this;
  setOptions(options: Partial<GlobeOptions>): this;
  setTheme(theme: GlobeTheme): this;
  setZoom(zoom: number): this;
  flyTo(lon: number, lat: number, options?: {instant?: boolean; zoom?: number}): this;
  project(lon: number, lat: number): {x:number; y:number; visible:boolean} | null;
  resize(): this;
  destroy(): void;
}
export declare function createGlobe(canvas: HTMLCanvasElement, options?: GlobeOptions): CastroGlobe;
