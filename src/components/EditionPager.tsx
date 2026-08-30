import { CaretLeft, CaretRight } from "@phosphor-icons/react";

export type EditionPagerLink = {
  href: string;
  issue: string;
  title: string;
};

type EditionPagerProps = {
  ariaLabel: string;
  previous?: EditionPagerLink;
  next?: EditionPagerLink;
  previousLabel: string;
  nextLabel: string;
  previousBoundary: string;
  nextBoundary: string;
};

function PagerItem({
  direction,
  label,
  boundary,
  item,
}: {
  direction: "previous" | "next";
  label: string;
  boundary: string;
  item?: EditionPagerLink;
}) {
  const Icon = direction === "previous" ? CaretLeft : CaretRight;
  const content = (
    <>
      <Icon aria-hidden="true" />
      <span className="edition-pager__copy">
        <small>{label}</small>
        <strong>{item?.issue ?? boundary}</strong>
        {item && <span>{item.title}</span>}
      </span>
    </>
  );

  if (!item) {
    return (
      <span className={"edition-pager__item edition-pager__item--" + direction + " is-disabled"} aria-disabled="true">
        {content}
      </span>
    );
  }

  return (
    <a className={"edition-pager__item edition-pager__item--" + direction} href={item.href}>
      {content}
    </a>
  );
}

export function EditionPager({
  ariaLabel,
  previous,
  next,
  previousLabel,
  nextLabel,
  previousBoundary,
  nextBoundary,
}: EditionPagerProps) {
  return (
    <nav className="edition-pager" aria-label={ariaLabel}>
      <PagerItem
        direction="previous"
        label={previousLabel}
        boundary={previousBoundary}
        item={previous}
      />
      <PagerItem
        direction="next"
        label={nextLabel}
        boundary={nextBoundary}
        item={next}
      />
    </nav>
  );
}
