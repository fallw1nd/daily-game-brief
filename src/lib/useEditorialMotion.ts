import type { RefObject } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const motion = {
  component: 0.18,
  section: 0.24,
  lead: 0.32,
  enterEase: "power2.out",
} as const;

export function useEditorialMotion(
  scope: RefObject<HTMLElement | null>,
  editionId: string,
) {
  useGSAP(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    gsap.from(".masthead-reveal", {
      y: 8,
      opacity: 0,
      duration: motion.section,
      stagger: 0.04,
      ease: motion.enterEase,
      clearProps: "transform,opacity",
    });

    gsap.from(".accent-signal", {
      scaleX: 0,
      duration: motion.section,
      transformOrigin: "left center",
      ease: motion.enterEase,
      clearProps: "transform",
    });

    gsap.from(".lead-story > .media-slot", {
      clipPath: "inset(0 0 100% 0)",
      scale: 0.994,
      duration: motion.lead,
      ease: motion.enterEase,
      clearProps: "clipPath,transform",
    });

    gsap.from(".lead-story > .media-slot img", {
      scale: 1.022,
      duration: motion.lead,
      ease: motion.enterEase,
      clearProps: "transform",
    });

    gsap.from(".focus-item", {
      y: 6,
      opacity: 0,
      duration: motion.component,
      stagger: 0.035,
      ease: motion.enterEase,
      clearProps: "transform,opacity",
    });

    gsap.utils.toArray<HTMLElement>(".section-header").forEach((header) => {
      gsap.from(header, {
        "--rule-scale": 0,
        duration: motion.section,
        ease: motion.enterEase,
        scrollTrigger: { trigger: header, start: "top 94%", once: true },
        clearProps: "--rule-scale",
      });
    });

  }, { scope, dependencies: [editionId], revertOnUpdate: true });
}
