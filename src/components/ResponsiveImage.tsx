import type { CSSProperties, ImgHTMLAttributes } from "react";
import { imageMetadata } from "../data/imageMetadata.generated";

type FetchPriority = "high" | "low" | "auto";

type ResponsiveImageProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "src" | "alt" | "loading" | "decoding"
> & {
  src: string;
  avif?: string;
  webp?: string;
  alt: string;
  pictureClassName?: string;
  imgClassName?: string;
  objectPosition?: CSSProperties["objectPosition"];
  loading?: "eager" | "lazy";
  decoding?: "async" | "sync" | "auto";
  fetchPriority?: FetchPriority;
  mobileWidth?: number;
};

function isLocalOptimizableImage(src: string) {
  return (
    !/^(https?:|data:|blob:|pending:)/i.test(src) &&
    !src.includes("/uploads/admin/") &&
    /\.(png|jpe?g|webp|avif)(\?.*)?$/i.test(src)
  );
}

function basePath() {
  const base = import.meta.env.BASE_URL || "/";
  return base.endsWith("/") ? base : `${base}/`;
}

function localPublicPath(src: string) {
  const withoutQuery = src.split(/[?#]/, 1)[0].replace(/\\/g, "/");
  const base = basePath();
  let pathname = withoutQuery;

  if (base !== "/" && base !== "./" && pathname.startsWith(base)) {
    pathname = pathname.slice(base.length);
  }

  pathname = pathname.replace(/^\.\//, "");
  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

function imageKey(src: string) {
  return localPublicPath(src).replace(/\.(png|jpe?g|webp|avif)$/i, "");
}

function withBase(pathname: string) {
  return `${basePath()}${pathname.replace(/^\//, "")}`;
}

function derivedOptimizedBase(src: string) {
  const pathname = localPublicPath(src).replace(/\.(png|jpe?g|webp|avif)$/i, "");

  if (pathname.startsWith("/uploads/originals/")) {
    return withBase(pathname.replace("/uploads/originals/", "/uploads/generated/"));
  }

  if (pathname === "/renshinkan-logo") {
    return withBase("/optimized/brand/renshinkan-logo");
  }

  return withBase(`/optimized${pathname}`);
}

function variantSrc(source: string, width: number, outputWidth: number) {
  if (width === outputWidth) {
    return source;
  }

  return source.replace(/\.(avif|webp)$/i, `-${width}.$1`);
}

function responsiveSrcSet(source: string, widths: readonly number[], outputWidth: number) {
  return widths.map((width) => `${variantSrc(source, width, outputWidth)} ${width}w`).join(", ");
}

function metadataFor(src: string) {
  const key = imageKey(src) as keyof typeof imageMetadata;
  return imageMetadata[key] as readonly [number, number, readonly number[]] | undefined;
}

function singleSource(src: string, extension: "avif" | "webp") {
  if (/\.(avif|webp)$/i.test(src)) {
    return src.replace(/\.(avif|webp)$/i, `.${extension}`);
  }

  return src.replace(/\.(png|jpe?g)(\?.*)?$/i, `.${extension}$2`);
}

export function ResponsiveImage({
  src,
  avif,
  webp,
  alt,
  pictureClassName,
  imgClassName,
  className,
  objectPosition,
  loading = "lazy",
  decoding = "async",
  fetchPriority,
  mobileWidth,
  sizes = "(max-width: 767px) 100vw, 50vw",
  style,
  ...imgProps
}: ResponsiveImageProps) {
  const imageClassName = imgClassName ?? className;
  const imageStyle = objectPosition ? { ...style, objectPosition } : style;
  const fetchPriorityProps = fetchPriority ? { fetchPriority } : {};

  const metadata = isLocalOptimizableImage(src) ? metadataFor(src) : undefined;

  if ((!isLocalOptimizableImage(src) || !metadata) && !avif && !webp) {
    return (
      <img
        {...imgProps}
        {...fetchPriorityProps}
        src={src}
        alt={alt}
        className={imageClassName}
        style={imageStyle}
        loading={loading}
        decoding={decoding}
        sizes={sizes}
      />
    );
  }

  const optimizedBase = metadata ? derivedOptimizedBase(src) : "";
  const avifSrc = avif || `${optimizedBase}.avif`;
  const webpSrc = webp || `${optimizedBase}.webp`;
  const outputWidth = metadata?.[0];
  const outputHeight = metadata?.[1];
  const widths = metadata?.[2];
  const avifSrcSet = outputWidth && widths
    ? responsiveSrcSet(avifSrc, widths, outputWidth)
    : singleSource(avifSrc, "avif");
  const webpSrcSet = outputWidth && widths
    ? responsiveSrcSet(webpSrc, widths, outputWidth)
    : singleSource(webpSrc, "webp");
  const mobileAvifSrc = mobileWidth && outputWidth
    ? variantSrc(avifSrc, mobileWidth, outputWidth)
    : undefined;
  const mobileWebpSrc = mobileWidth && outputWidth
    ? variantSrc(webpSrc, mobileWidth, outputWidth)
    : undefined;

  return (
    <picture className={pictureClassName}>
      {mobileAvifSrc ? <source media="(max-width: 639px)" srcSet={mobileAvifSrc} type="image/avif" /> : null}
      {mobileWebpSrc ? <source media="(max-width: 639px)" srcSet={mobileWebpSrc} type="image/webp" /> : null}
      <source srcSet={avifSrcSet} sizes={sizes} type="image/avif" />
      <source srcSet={webpSrcSet} sizes={sizes} type="image/webp" />
      <img
        {...imgProps}
        {...fetchPriorityProps}
        src={webpSrc}
        alt={alt}
        className={imageClassName}
        style={imageStyle}
        loading={loading}
        decoding={decoding}
        sizes={sizes}
        width={imgProps.width ?? outputWidth}
        height={imgProps.height ?? outputHeight}
      />
    </picture>
  );
}
