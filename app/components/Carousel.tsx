"use client";

import { useRef, useState, type ReactNode } from "react";

export type CarouselSlide = { key: string; label: string; node: ReactNode };

/** Swipeable, snap-scrolling cards with dots. Shared by the home summary and the payment accounts. */
export function Carousel({ slides, label, idPrefix = "slide" }: { slides: CarouselSlide[]; label: string; idPrefix?: string }) {
  const [active, setActive] = useState(0);
  const track = useRef<HTMLDivElement>(null);

  const onScroll = () => {
    const el = track.current;
    if (!el) return;
    const items = Array.from(el.children) as HTMLElement[];
    const nearest = items.reduce(
      (best, item, index) => (Math.abs(item.offsetLeft - el.scrollLeft) < Math.abs(items[best].offsetLeft - el.scrollLeft) ? index : best),
      0,
    );
    setActive(nearest);
  };

  const goTo = (index: number) => {
    const el = track.current;
    const item = el?.children[index] as HTMLElement | undefined;
    if (el && item) el.scrollTo({ left: item.offsetLeft });
  };

  return (
    <section className="carousel" aria-roledescription="carousel" aria-label={label}>
      <div
        className="carousel-track"
        ref={track}
        onScroll={onScroll}
        tabIndex={0}
        role="group"
        aria-label="Cards. Use left and right arrow keys to browse."
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          const next = event.key === "ArrowRight" ? active + 1 : event.key === "ArrowLeft" ? active - 1 : null;
          if (next === null) return;
          event.preventDefault();
          goTo(Math.max(0, Math.min(slides.length - 1, next)));
        }}
      >
        {slides.map((slide, index) => (
          <div
            aria-label={`${index + 1} of ${slides.length}: ${slide.label}`}
            aria-roledescription="slide"
            className="carousel-item"
            id={`${idPrefix}-${slide.key}`}
            key={slide.key}
            role="group"
            onFocusCapture={() => goTo(index)}
          >
            {slide.node}
          </div>
        ))}
      </div>
      {slides.length > 1 ? (
        <div className="carousel-dots">
          {slides.map((slide, index) => (
            <button
              aria-controls={`${idPrefix}-${slide.key}`}
              aria-current={active === index}
              aria-label={`Show ${slide.label}`}
              className={active === index ? "on" : ""}
              key={slide.key}
              type="button"
              onClick={() => goTo(index)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
