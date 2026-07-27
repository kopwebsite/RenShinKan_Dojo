import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import { createPortal } from "react-dom";
import type { GalleryPhoto } from "../../shared/gallery";
import { useTranslation } from "../i18n";

export type LightboxItem = {
  albumId: string;
  albumTitle: string;
  albumDate?: string;
  photo: GalleryPhoto;
};

type GalleryLightboxProps = {
  items: LightboxItem[];
  initialIndex: number;
  onClose: () => void;
};

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function GalleryLightbox({ items, initialIndex, onClose }: GalleryLightboxProps) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(Math.min(Math.max(initialIndex, 0), Math.max(items.length - 1, 0)));
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const touchStart = useRef<number | null>(null);
  const item = items[index];
  const previous = () => setIndex((current) => (current - 1 + items.length) % items.length);
  const next = () => setIndex((current) => (current + 1) % items.length);
  const thumbnailIndexes = useMemo(() => {
    const count = Math.min(items.length, 9);
    const start = Math.min(Math.max(index - Math.floor(count / 2), 0), Math.max(items.length - count, 0));
    return Array.from({ length: count }, (_, offset) => start + offset);
  }, [index, items.length]);

  useEffect(() => {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus();
    };
  }, []);

  useEffect(() => {
    if (items.length < 2) return;
    const preload = new Image();
    preload.src = items[(index + 1) % items.length].photo.src;
  }, [index, items]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowLeft" && items.length > 1) {
        event.preventDefault();
        previous();
      } else if (event.key === "ArrowRight" && items.length > 1) {
        event.preventDefault();
        next();
      } else if (event.key === "Tab" && dialogRef.current) {
        const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
          .filter((element) => element.offsetParent !== null);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  if (!item) return null;

  function onTouchStart(event: TouchEvent) {
    touchStart.current = event.touches[0]?.clientX ?? null;
  }

  function onTouchEnd(event: TouchEvent) {
    if (touchStart.current == null || items.length < 2) return;
    const distance = (event.changedTouches[0]?.clientX ?? touchStart.current) - touchStart.current;
    touchStart.current = null;
    if (Math.abs(distance) < 45) return;
    if (distance > 0) previous();
    else next();
  }

  return createPortal(
    <div
      className="gallery-lightbox"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="gallery-lightbox__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gallery-lightbox-title"
        aria-describedby="gallery-lightbox-position"
      >
        <header>
          <div>
            <p id="gallery-lightbox-position" aria-live="polite">
              {t("photoGalleries.position", { current: index + 1, total: items.length })}
            </p>
            <h2 id="gallery-lightbox-title">{item.albumTitle}</h2>
            {item.albumDate ? <time dateTime={item.albumDate}>{item.albumDate}</time> : null}
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label={t("photoGalleries.close")}>
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="gallery-lightbox__stage" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <img
            key={item.photo.id}
            src={item.photo.src}
            alt={item.photo.alt || t("photoGalleries.photoAlt", { number: index + 1, album: item.albumTitle })}
            width={item.photo.width}
            height={item.photo.height}
            style={{ objectPosition: item.photo.objectPosition || "50% 50%" }}
          />
          {items.length > 1 ? (
            <>
              <button className="gallery-lightbox__previous" type="button" onClick={previous} aria-label={t("photoGalleries.previous")}>
                <ChevronLeft aria-hidden="true" />
              </button>
              <button className="gallery-lightbox__next" type="button" onClick={next} aria-label={t("photoGalleries.next")}>
                <ChevronRight aria-hidden="true" />
              </button>
            </>
          ) : null}
        </div>

        {item.photo.caption ? <p className="gallery-lightbox__caption">{item.photo.caption}</p> : null}

        {items.length > 1 ? (
          <nav className="gallery-lightbox__thumbs" aria-label={t("photoGalleries.thumbnails")}>
            {thumbnailIndexes.map((thumbnailIndex) => {
              const thumbnail = items[thumbnailIndex];
              return (
                <button
                  type="button"
                  key={`${thumbnail.albumId}-${thumbnail.photo.id}`}
                  onClick={() => setIndex(thumbnailIndex)}
                  aria-label={t("photoGalleries.goTo", { number: thumbnailIndex + 1 })}
                  aria-current={thumbnailIndex === index ? "true" : undefined}
                >
                  <img
                    src={thumbnail.photo.thumbnailSrc || thumbnail.photo.src}
                    alt=""
                    loading="lazy"
                    width={80}
                    height={64}
                    style={{ objectPosition: thumbnail.photo.objectPosition || "50% 50%" }}
                  />
                </button>
              );
            })}
          </nav>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
