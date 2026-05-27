import type { CSSProperties, ImgHTMLAttributes } from "react";

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
};

function isLocalOptimizableImage(src: string) {
  return !/^(https?:|data:|blob:|pending:)/i.test(src) && /\.(png|jpe?g|webp)(\?.*)?$/i.test(src);
}

function replaceExtension(src: string, extension: "avif" | "webp") {
  return src.replace(/\.(png|jpe?g|webp)(\?.*)?$/i, `.${extension}$2`);
}

function derivedOptimizedSrc(src: string, extension: "avif" | "webp") {
  const withNewExtension = replaceExtension(src, extension);

  if (src.includes("/uploads/originals/")) {
    return withNewExtension.replace("/uploads/originals/", "/uploads/generated/");
  }

  if (src.includes("/dojo-photos/")) {
    return withNewExtension.replace("/dojo-photos/", "/optimized/dojo-photos/");
  }

  if (src.includes("/past-events/")) {
    return withNewExtension.replace("/past-events/", "/optimized/past-events/");
  }

  return withNewExtension;
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
  style,
  ...imgProps
}: ResponsiveImageProps) {
  const imageClassName = imgClassName ?? className;
  const imageStyle = objectPosition ? { ...style, objectPosition } : style;

  if (!isLocalOptimizableImage(src) && !avif && !webp) {
    return (
      <img
        {...imgProps}
        src={src}
        alt={alt}
        className={imageClassName}
        style={imageStyle}
        loading={loading}
        decoding={decoding}
        fetchPriority={fetchPriority}
      />
    );
  }

  const avifSrc = avif || derivedOptimizedSrc(src, "avif");
  const webpSrc = webp || derivedOptimizedSrc(src, "webp");

  return (
    <picture className={pictureClassName}>
      <source srcSet={avifSrc} type="image/avif" />
      <source srcSet={webpSrc} type="image/webp" />
      <img
        {...imgProps}
        src={src}
        alt={alt}
        className={imageClassName}
        style={imageStyle}
        loading={loading}
        decoding={decoding}
        fetchPriority={fetchPriority}
      />
    </picture>
  );
}
