import { useEffect } from "react";

export default function useScrollReveal() {
  useEffect(() => {
    let raf;

    function observe() {
      const elements = document.querySelectorAll(".reveal:not(.revealed)");
      if (!elements.length) return;

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("revealed");
              observer.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.1 }
      );

      elements.forEach((el) => observer.observe(el));
      return observer;
    }

    // Defer until after React has painted the new page
    raf = requestAnimationFrame(() => {
      const observer = observe();
      return () => observer?.disconnect();
    });

    return () => {
      cancelAnimationFrame(raf);
    };
  }, []);
}
