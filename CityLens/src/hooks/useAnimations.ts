import { useEffect, useRef, useState } from 'react';

/**
 * Observes elements with `.scroll-reveal`, `.scroll-reveal-left`, `.scroll-reveal-right`
 * and adds `.visible` class when they enter the viewport.
 */
export function useScrollReveal() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -60px 0px' }
    );

    const elements = document.querySelectorAll(
      '.scroll-reveal, .scroll-reveal-left, .scroll-reveal-right'
    );
    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);
}

/**
 * Animated number counter that counts up when visible.
 */
export function useCountUp(end: number, duration: number = 2000) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          const start = performance.now();
          const animate = (now: number) => {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
            setCount(Math.floor(eased * end));
            if (progress < 1) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [end, duration]);

  return { count, ref };
}

/**
 * Typing animation hook that cycles through prompts.
 */
export function useTypingAnimation(prompts: string[], typingSpeed = 60, pauseMs = 2200) {
  const [text, setText] = useState('');
  const [promptIndex, setPromptIndex] = useState(0);

  useEffect(() => {
    const prompt = prompts[promptIndex];
    let charIndex = 0;
    let deleting = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      if (!deleting) {
        setText(prompt.slice(0, charIndex + 1));
        charIndex++;
        if (charIndex >= prompt.length) {
          timer = setTimeout(() => { deleting = true; tick(); }, pauseMs);
          return;
        }
        timer = setTimeout(tick, typingSpeed);
      } else {
        setText(prompt.slice(0, charIndex));
        charIndex--;
        if (charIndex < 0) {
          setPromptIndex((prev) => (prev + 1) % prompts.length);
          return;
        }
        timer = setTimeout(tick, typingSpeed / 2);
      }
    };

    timer = setTimeout(tick, 400);
    return () => clearTimeout(timer);
  }, [promptIndex, prompts, typingSpeed, pauseMs]);

  return text;
}
