declare module 'imagetracerjs' {
  export type ImageTracerPaletteColor = {
    r: number;
    g: number;
    b: number;
    a: number;
  };

  export type ImageTracerOptions = {
    corsenabled?: boolean;
    ltres?: number;
    qtres?: number;
    pathomit?: number;
    rightangleenhance?: boolean;
    colorsampling?: number;
    numberofcolors?: number;
    mincolorratio?: number;
    colorquantcycles?: number;
    layering?: number;
    strokewidth?: number;
    linefilter?: boolean;
    scale?: number;
    roundcoords?: number;
    viewbox?: boolean;
    desc?: boolean;
    lcpr?: number;
    qcpr?: number;
    blurradius?: number;
    blurdelta?: number;
    pal?: ImageTracerPaletteColor[];
  };

  const ImageTracer: {
    imagedataToSVG: (imageData: ImageData, options?: string | ImageTracerOptions) => string;
  };

  export default ImageTracer;
}