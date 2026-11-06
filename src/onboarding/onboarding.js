// =============================================================================
// SafeCart onboarding tour
// -----------------------------------------------------------------------------
// 5-slide first-run tour. Opened by service-worker on chrome.runtime.onInstalled
// with reason 'install'. User can advance with Next/Back buttons, dot navigation,
// or keyboard arrows. Final slide offers to open the popup for sign-up.
// =============================================================================

const TOTAL_SLIDES = 5;
let currentSlide = 1;

function showSlide(targetSlide) {
  if (targetSlide < 1 || targetSlide > TOTAL_SLIDES) return;

  const slides = document.querySelectorAll('.slide');
  const dots = document.querySelectorAll('.dot');

  slides.forEach((slide) => {
    const num = parseInt(slide.dataset.slide, 10);
    slide.classList.remove('active', 'exit-left');
    if (num === targetSlide) {
      slide.classList.add('active');
    } else if (num < targetSlide) {
      slide.classList.add('exit-left');
    }
  });

  dots.forEach((dot) => {
    const num = parseInt(dot.dataset.target, 10);
    dot.classList.toggle('active', num === targetSlide);
  });

  currentSlide = targetSlide;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openPopupForSignUp() {
  // Best effort: open the extension's popup. Chrome doesn't expose a direct
  // API to open the action popup from a tab, so we close the tab and the user
  // sees a notification reminding them to click the icon.
  chrome.notifications.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: 'Click the SafeCart icon to sign up',
    message: 'Look for the cart icon in your Chrome toolbar (you may need to pin it).',
    priority: 1,
  });
  window.close();
}

function closeTab() {
  window.close();
}

document.addEventListener('DOMContentLoaded', () => {
  // Button click handlers
  document.querySelectorAll('button[data-action]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const action = e.currentTarget.dataset.action;
      switch (action) {
        case 'next':
          showSlide(currentSlide + 1);
          break;
        case 'prev':
          showSlide(currentSlide - 1);
          break;
        case 'skip':
          closeTab();
          break;
        case 'close':
          closeTab();
          break;
        case 'signup':
          openPopupForSignUp();
          break;
      }
    });
  });

  // Dot navigation
  document.querySelectorAll('.dot').forEach((dot) => {
    dot.addEventListener('click', (e) => {
      const target = parseInt(e.currentTarget.dataset.target, 10);
      showSlide(target);
    });
  });

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' && currentSlide < TOTAL_SLIDES) {
      showSlide(currentSlide + 1);
    } else if (e.key === 'ArrowLeft' && currentSlide > 1) {
      showSlide(currentSlide - 1);
    } else if (e.key === 'Escape') {
      closeTab();
    }
  });
});
