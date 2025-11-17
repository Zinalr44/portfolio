// Grab the mode toggle checkbox
const modeToggle = document.getElementById('mode-toggle');

// Determine theme: saved -> system -> dark
const savedTheme = localStorage.getItem('theme');
const systemPrefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
const initialTheme = savedTheme || (systemPrefersLight ? 'light' : 'dark');
document.documentElement.setAttribute('data-theme', initialTheme);

// Set toggle and aria state
if (modeToggle) {
  modeToggle.checked = initialTheme === 'light';
  modeToggle.setAttribute('aria-checked', String(modeToggle.checked));
}

// Set initial theme-color meta to match theme
const themeColorMeta = document.querySelector('meta[name="theme-color"]');
if (themeColorMeta) {
  const darkColor = '#0f0f0f';
  const lightColor = '#ffffff';
  themeColorMeta.setAttribute('content', initialTheme === 'light' ? lightColor : darkColor);
}

// DOM-ready enhancements
document.addEventListener('DOMContentLoaded', () => {
  // Chatbot Showcase Functionality
  // Move chatbot to showcase section if it exists
  const chatbot = document.getElementById('chatbot');
  const chatbotContainer = document.querySelector('.chatbot-container');
  if (chatbot && chatbotContainer) {
    // Remove from original position and add to showcase
    chatbot.remove();
    chatbotContainer.appendChild(chatbot);
  }

  // Initialize suggestion chips
  const suggestionChips = document.querySelectorAll('.suggestion-chip');
  suggestionChips.forEach(chip => {
    chip.addEventListener('click', function() {
      const query = this.getAttribute('data-query');
      if (window.chatbotApi && typeof window.chatbotApi.sendMessage === 'function') {
        window.chatbotApi.sendMessage(query);
      } else if (window.chatbot && window.chatbot.sendMessage) {
        window.chatbot.sendMessage(query);
      }
      // Scroll to chatbot
      document.getElementById('chatbot').scrollIntoView({ behavior: 'smooth' });
    });
  });

  // Add animation to features on scroll
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
      }
    });
  }, observerOptions);

  // Observe feature elements
  document.querySelectorAll('.feature').forEach((feature, index) => {
    feature.style.opacity = '0';
    feature.style.transform = 'translateY(20px)';
    feature.style.transition = `opacity 0.5s ease ${index * 0.1}s, transform 0.5s ease ${index * 0.1}s`;
    observer.observe(feature);
  });

  // 1) Auto-update footer year
  const yearEl = document.getElementById('year');
  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }

  // Respect reduced motion: if user prefers reduced, skip animated reveals
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 2) Reveal-on-scroll setup
  const revealTargets = [
    ...document.querySelectorAll('.section, .project-item, .experience-item, .achievement-item')
  ];
  revealTargets.forEach(el => el.classList.add('reveal'));

  if (!prefersReduced && 'IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    revealTargets.forEach(el => revealObserver.observe(el));
  } else {
    // If reduced motion or no IO support, show immediately
    revealTargets.forEach(el => el.classList.add('revealed'));
  }

  // 3) Active nav highlighting
  const sections = ['#about', '#skills', '#projects', '#achievements', '#experience', '#contact']
    .map(id => document.querySelector(id))
    .filter(Boolean);
  const navLinks = Array.from(document.querySelectorAll('header nav ul li a'));

  if ('IntersectionObserver' in window && sections.length) {
    const navObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const id = entry.target.getAttribute('id');
        if (entry.isIntersecting && id) {
          navLinks.forEach(a => {
            const href = a.getAttribute('href');
            if (href === `#${id}`) a.classList.add('active');
            else a.classList.remove('active');
          });
        }
      });
    }, { threshold: 0.6 });
    sections.forEach(sec => navObserver.observe(sec));
  }
});

// Event listener for the toggle
modeToggle.addEventListener('change', () => {
  const theme = modeToggle.checked ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  modeToggle.setAttribute('aria-checked', String(modeToggle.checked));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#ffffff' : '#0f0f0f');
});
// Select the scroll-to-top button
// Improved scroll event handler with throttling
let scrollTimeout;
const scrollTopBtn = document.getElementById('scrollTopBtn');

window.addEventListener('scroll', function() {
    if (!scrollTimeout) {
        scrollTimeout = setTimeout(function() {
            if (document.body.scrollTop > 300 || document.documentElement.scrollTop > 300) {
                scrollTopBtn.style.display = 'block';
                scrollTopBtn.style.opacity = '1';
            } else {
                scrollTopBtn.style.opacity = '0';
                setTimeout(() => {
                    if (scrollTopBtn.style.opacity === '0') {
                        scrollTopBtn.style.display = 'none';
                    }
                }, 300);
            }
            scrollTimeout = null;
        }, 100);
    }
});
// Smooth scroll for navigation links
document.querySelectorAll('nav a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        e.preventDefault();
        
        const targetId = this.getAttribute('href');
        const targetElement = document.querySelector(targetId);
        
        if (targetElement) {
            const headerOffset = 80;
            const elementPosition = targetElement.getBoundingClientRect().top;
            const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
            
            window.scrollTo({
                top: offsetPosition,
                behavior: 'smooth'
            });
        }
    });
});
// Hide loader when page is loaded
window.addEventListener('load', function() {
    const loader = document.getElementById('loader');
    
    if (loader) {
        loader.style.opacity = '0';
        setTimeout(() => {
            loader.style.display = 'none';
        }, 500);
    }
});
// Mobile Menu Toggle
const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
const navMenu = document.querySelector('header nav ul');

if (mobileMenuToggle && navMenu) {
    mobileMenuToggle.addEventListener('click', function() {
        this.classList.toggle('active');
        navMenu.classList.toggle('show');
        document.body.classList.toggle('menu-open');
        const expanded = this.getAttribute('aria-expanded') === 'true';
        this.setAttribute('aria-expanded', String(!expanded));
    });
    
    // Close menu when clicking on a link
    const navLinks = document.querySelectorAll('header nav ul li a');
    navLinks.forEach(link => {
        link.addEventListener('click', function() {
            mobileMenuToggle.classList.remove('active');
            navMenu.classList.remove('show');
            document.body.classList.remove('menu-open');
            mobileMenuToggle.setAttribute('aria-expanded', 'false');
        });
    });
}