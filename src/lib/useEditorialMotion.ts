import type { RefObject } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(useGSAP, ScrollTrigger);

export function useEditorialMotion(
  scope: RefObject<HTMLElement | null>,
  editionId: string,
) {
  useGSAP(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    gsap.from(".masthead-reveal", {
      y: 18,
      opacity: 0,
      duration: 0.72,
      stagger: 0.07,
      ease: "power3.out",
      clearProps: "transform,opacity",
    });

    gsap.from(".accent-signal", {
      scaleX: 0,
      duration: 0.86,
      transformOrigin: "left center",
      ease: "power3.out",
      clearProps: "transform",
    });

    gsap.from(".lead-story > .media-slot", {
      clipPath: "inset(0 0 100% 0)",
      scale: 0.985,
      duration: 0.78,
      ease: "power3.out",
      clearProps: "clipPath,transform",
    });

    gsap.from(".lead-story > .media-slot img", {
      scale: 1.055,
      duration: 0.95,
      ease: "power3.out",
      clearProps: "transform",
    });

    gsap.from(".focus-item", {
      y: 12,
      opacity: 0,
      duration: 0.48,
      stagger: 0.055,
      ease: "power2.out",
      clearProps: "transform,opacity",
    });

    gsap.utils.toArray<HTMLElement>(".section-header").forEach((header) => {
      gsap.from(header, {
        "--rule-scale": 0,
        duration: 0.62,
        ease: "power2.out",
        scrollTrigger: { trigger: header, start: "top 94%", once: true },
        clearProps: "--rule-scale",
      });
    });

    gsap.utils.toArray<HTMLElement>(".reveal-row").forEach((row) => {
      gsap.from(row, {
        y: 18,
        opacity: 0,
        duration: 0.52,
        ease: "power2.out",
        scrollTrigger: { trigger: row, start: "top 92%", once: true },
        clearProps: "transform,opacity",
      });
    });
  }, { scope, dependencies: [editionId], revertOnUpdate: true });
}
