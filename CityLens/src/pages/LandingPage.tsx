import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import './LandingPage.css';

export default function LandingPage() {
  const navigate = useNavigate();
  const [showVideo, setShowVideo] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const typedRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleGlobalMouseMove);
    return () => window.removeEventListener('mousemove', handleGlobalMouseMove);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 60);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const particles: any[] = [];
    const mouse = { x: null as number | null, y: null as number | null };
    let animationFrameId: number;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Using a typed handler for mouse events
    const handleMouse = (e: MouseEvent) => { mouse.x = e.clientX; mouse.y = e.clientY; };
    window.addEventListener('mousemove', handleMouse);

    class Particle {
      x: number; y: number; vx: number; vy: number; radius: number; alpha: number;
      constructor() {
        this.x = Math.random() * canvas!.width;
        this.y = Math.random() * canvas!.height;
        this.vx = (Math.random() - 0.5) * 0.3;
        this.vy = (Math.random() - 0.5) * 0.3;
        this.radius = Math.random() * 1.5 + 0.5;
        this.alpha = Math.random() * 0.5 + 0.1;
      }
      update() {
        this.x += this.vx;
        this.y += this.vy;
        if (this.x < 0 || this.x > canvas!.width) this.vx *= -1;
        if (this.y < 0 || this.y > canvas!.height) this.vy *= -1;

        if (mouse.x !== null && mouse.y !== null) {
          const dx = this.x - mouse.x;
          const dy = this.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            const force = (150 - dist) / 150;
            this.vx += (dx / dist) * force * 0.05;
            this.vy += (dy / dist) * force * 0.05;
          }
        }
        this.vx *= 0.99;
        this.vy *= 0.99;
      }
      draw() {
        if (!ctx) return;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(147, 197, 253, ${this.alpha})`;
        ctx.fill();
      }
    }

    for (let i = 0; i < 80; i++) particles.push(new Particle());

    function drawLines() {
      if (!ctx) return;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(96, 165, 250, ${0.08 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
    }

    function animateParticles() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => { p.update(); p.draw(); });
      drawLines();
      animationFrameId = requestAnimationFrame(animateParticles);
    }
    animateParticles();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', handleMouse);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  useEffect(() => {
    const typedEl = typedRef.current;
    if (!typedEl) return;

    const phrases = [
      'Change King St. to a high density residential area',
      'Build a protected bike lane on University Ave',
      'Add another building to the SPUR Innovation area',
      'Find the areas with the highest innovation opportunities',
    ];

    let phraseIndex = 0;
    let charIndex = 0;
    let isDeleting = false;
    let typeSpeed = 50;
    let timeoutId: ReturnType<typeof setTimeout>;

    function typeLoop() {
      const currentPhrase = phrases[phraseIndex];
      if (!typedEl) return;

      if (!isDeleting) {
        typedEl.textContent = currentPhrase.substring(0, charIndex + 1);
        charIndex++;
        if (charIndex === currentPhrase.length) {
          timeoutId = setTimeout(() => { isDeleting = true; typeLoop(); }, 2200);
          return;
        }
        typeSpeed = 35 + Math.random() * 40;
      } else {
        typedEl.textContent = currentPhrase.substring(0, charIndex - 1);
        charIndex--;
        if (charIndex === 0) {
          isDeleting = false;
          phraseIndex = (phraseIndex + 1) % phrases.length;
          timeoutId = setTimeout(typeLoop, 400);
          return;
        }
        typeSpeed = 20;
      }
      timeoutId = setTimeout(typeLoop, typeSpeed);
    }
    timeoutId = setTimeout(typeLoop, 1800);

    return () => clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    const observerOptions = { threshold: 0.15, rootMargin: '0px 0px -40px 0px' };
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const delay = (entry.target as HTMLElement).dataset.delay || '0';
          setTimeout(() => {
            entry.target.classList.add('visible');
          }, parseInt(delay, 10));
          observer.unobserve(entry.target);
        }
      });
    }, observerOptions);

    document.querySelectorAll('.feature-card, .step, .cta-box').forEach(el => {
      observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div className="citylens-landing">
      {/* Dynamic mouse glow trail */}
      <div 
        className="mouse-glow" 
        style={{ left: `${mousePos.x}px`, top: `${mousePos.y}px` }}
      />
      <div className="noise" />

      <nav className={`navbar ${scrolled ? 'scrolled' : ''}`} id="navbar">
        <a href="#" className="nav-logo">
          <img src="/logo.png" alt="CityLens Logo" />
          CityLens
        </a>
        <div className="nav-links">
          <a href="#features">Features</a>
          <a href="#how">How It Works</a>
          <button className="nav-cta" onClick={() => navigate('/city/waterloo')}>Try CityLens</button>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-bg" />
        <div className="hero-grid" />
        <canvas id="particles-canvas" ref={canvasRef} />
        <div className="hero-orb hero-orb-1" />
        <div className="hero-orb hero-orb-2" />
        <div className="hero-orb hero-orb-3" />

        <div className="hero-content">
          <div className="hero-badge">
            <svg viewBox="0 0 16 16" fill="none"><path d="M8 1l1.5 3.2L13 5l-2.5 2.5.5 3.5L8 9.5 4.8 11l.7-3.5L3 5l3.5-.8L8 1z" fill="currentColor" /></svg>
            AI-Powered Urban Planning
          </div>

          <h1 className="hero-title">
            <span className="line">Reimagine</span>
            <span className="line">Your City.</span>
          </h1>

          <p className="hero-sub">
            Visualize how neighborhoods could evolve. Simulate zoning, density,
            transit, and infrastructure changes instantly.
          </p>

          <div className="hero-actions">
            <button onClick={() => navigate('/city/waterloo')} className="btn-primary">
              Try CityLens
              <svg viewBox="0 0 18 18" fill="none"><path d="M3.75 9h10.5M9.75 4.5L14.25 9l-4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <button onClick={() => setShowVideo(true)} className="btn-secondary">
              <svg viewBox="0 0 18 18" fill="none" width="16" height="16"><polygon points="6,3 15,9 6,15" fill="currentColor" /></svg>
              Watch Demo
            </button>
          </div>

          <div className="terminal-wrapper">
            <div className="terminal">
              <div className="terminal-bar">
                <div className="terminal-dot" />
                <div className="terminal-dot" />
                <div className="terminal-dot" />
                <span>citylens-cli</span>
              </div>
              <div className="terminal-body">
                <span className="terminal-prompt">&gt;</span>
                <span className="terminal-text" ref={typedRef}></span><span className="terminal-cursor" />
              </div>
            </div>
          </div>
        </div>

        <div className="scroll-indicator">
          <span>Scroll</span>
          <div className="scroll-line" />
        </div>
      </section>

      {/* Features */}
      <section className="section section-features" id="features">
        <div className="section-header">
          <div className="section-label">Capabilities</div>
          <h2>Everything you need to reshape urban futures</h2>
          <p>Powerful simulation tools that help planners, citizens, and policymakers make smarter decisions about the spaces we share.</p>
        </div>

        <div className="features-grid">
          <div className="feature-card" data-delay="0">
            <div className="feature-icon">
              <svg viewBox="0 0 24 24" fill="none"><path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="2" /></svg>
            </div>
            <h3>Zoning Simulation</h3>
            <p>Instantly visualize the impact of rezoning decisions on neighborhoods, density, and land use patterns.</p>
          </div>

          <div className="feature-card" data-delay="100">
            <div className="feature-icon">
              <svg viewBox="0 0 24 24" fill="none"><path d="M3 12h4l3-9 4 18 3-9h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <h3>Density Analysis</h3>
            <p>Model population growth, housing demand, and infrastructure load across any area of your city.</p>
          </div>

          <div className="feature-card" data-delay="200">
            <div className="feature-icon">
              <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" /><rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" /><rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" /><rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" /></svg>
            </div>
            <h3>Transit Planning</h3>
            <p>Simulate new transit routes, stops, and connections to optimize commute times and accessibility.</p>
          </div>

          <div className="feature-card" data-delay="300">
            <div className="feature-icon">
              <svg viewBox="0 0 24 24" fill="none"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" stroke="currentColor" strokeWidth="2" /><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" stroke="currentColor" strokeWidth="2" /></svg>
            </div>
            <h3>3D Visualization</h3>
            <p>See proposed changes rendered in real-time 3D, giving stakeholders a tangible preview of the future.</p>
          </div>

          <div className="feature-card" data-delay="400">
            <div className="feature-icon">
              <svg viewBox="0 0 24 24" fill="none"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" stroke="currentColor" strokeWidth="2" /><path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </div>
            <h3>AI Recommendations</h3>
            <p>Get intelligent suggestions for optimal land use based on demographic data, economic trends, and environmental impact.</p>
          </div>

          <div className="feature-card" data-delay="500">
            <div className="feature-icon">
              <svg viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" /><circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="2" /></svg>
            </div>
            <h3>Community Input</h3>
            <p>Let citizens participate in planning by submitting and voting on proposals through a simple, intuitive interface.</p>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="section section-how" id="how">
        <div className="section-header" style={{ margin: '0 auto 80px', textAlign: 'center' }}>
          <div className="section-label" style={{ justifyContent: 'center' }}>Process</div>
          <h2>Three steps to a<br />smarter city</h2>
          <p style={{ margin: '20px auto 0' }}>From natural language to actionable urban insights in seconds.</p>
        </div>

        <div className="steps-container">
          <div className="step" data-delay="0">
            <div className="step-number">1</div>
            <h3>Describe Your Vision</h3>
            <p>Type what you want to change — rezoning, new transit lines, increased density — in plain English.</p>
          </div>
          <div className="step" data-delay="200">
            <div className="step-number">2</div>
            <h3>AI Simulates Impact</h3>
            <p>Our engine models the ripple effects across infrastructure, population, environment, and economy.</p>
          </div>
          <div className="step" data-delay="400">
            <div className="step-number">3</div>
            <h3>Explore & Decide</h3>
            <p>Interact with 3D visualizations, compare scenarios side-by-side, and share plans with stakeholders.</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section section-cta" id="cta">
        <div className="cta-glow" />
        <div className="cta-box">
          <h2>Start exploring<br />your city today</h2>
          <p>Join thousands of planners and citizens already reshaping urban futures with CityLens.</p>
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
            <button onClick={() => navigate('/city/waterloo')} className="btn-primary">
              Try CityLens
              <svg viewBox="0 0 18 18" fill="none" width="18" height="18"><path d="M3.75 9h10.5M9.75 4.5L14.25 9l-4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <button className="btn-secondary">Join the Waitlist</button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <span>&copy; 2026 CityLens &middot; Built at Hack Canada 2026 &middot; <small>By Jaineel Patel, Sajan Paventhan, Bhavya Patel, Dhruv Joshi</small> </span>
        <div className="footer-links">
          <a href="#">Privacy</a>
          <a href="#">Terms</a>
          <a href="#">GitHub</a>
        </div>
      </footer>

      {/* Video Modal */}
      {showVideo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in" onClick={() => setShowVideo(false)}>
          <div className="relative w-full max-w-5xl aspect-video bg-black rounded-xl overflow-hidden border border-white/10 shadow-2xl" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setShowVideo(false)}
              className="absolute top-4 right-4 z-10 w-10 h-10 flex items-center justify-center bg-black/50 hover:bg-white/20 text-white rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <video
              src="/demovideo.mp4"
              autoPlay
              controls
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      )}
    </div>
  );
}
