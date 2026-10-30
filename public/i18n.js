// Kr6DnD Runtime Localization Engine (RU <-> EN)
(function() {
  'use strict';

  const dict = (typeof window !== 'undefined' && window.KR_I18N_DICT) ? window.KR_I18N_DICT : (typeof require !== 'undefined' ? require('./i18n-dict') : { ru2en: {}, en2ru: {} });
  const en2ru = dict.en2ru || {};
  const ru2en = dict.ru2en || {};

  // Match original text once, longest phrase first. Never translate inside words
  // or feed a translated fragment back through the dictionary.
  const compoundPatterns = {};
  function translateCompound(text, lang) {
    const translations = lang === 'ru' ? en2ru : ru2en;
    if (!compoundPatterns[lang]) {
      const word = '[\\p{L}\\p{N}_]';
      const keys = Object.keys(translations).filter(key => key.length >= 3)
        .sort((a, b) => b.length - a.length);
      if (!keys.length) return text;
      compoundPatterns[lang] = new RegExp(keys.map(key => {
        const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return (/^[\p{L}\p{N}_]/u.test(key) ? `(?<!${word})` : '') + escaped +
          (/[\p{L}\p{N}_]$/u.test(key) ? `(?!${word})` : '');
      }).join('|'), 'gu');
    }
    return text.replace(compoundPatterns[lang], match => translations[match]);
  }

  function getLang() {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('kr6_lang');
      if (stored === 'ru' || stored === 'en') return stored;
    }
    if (typeof navigator !== 'undefined' && navigator.language && navigator.language.toLowerCase().startsWith('ru')) {
      return 'ru';
    }
    return 'en'; // default English
  }

  function setLang(lang) {
    if (lang !== 'ru' && lang !== 'en') lang = 'en';
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('kr6_lang', lang);
    }
    applyLanguage(lang);
  }

  function t(text, targetLang) {
    if (!text || typeof text !== 'string') return text;
    const lang = targetLang || getLang();
    const trimmed = text.trim();
    if (!trimmed) return text;

    if (lang === 'en') {
      if (ru2en[text]) return ru2en[text];
      if (ru2en[trimmed]) return text.replace(trimmed, ru2en[trimmed]);
      let m;
      if ((m = trimmed.match(/^Готово (\d+) из (\d+)$/))) return text.replace(trimmed, `Ready ${m[1]} of ${m[2]}`);
      if ((m = trimmed.match(/^Ожидание: (.*)$/))) return text.replace(trimmed, `Waiting: ${m[1]}`);
      if ((m = trimmed.match(/^Клетка (\d+),\s*(\d+)$/))) return text.replace(trimmed, `Cell ${m[1]}, ${m[2]}`);
      if ((m = trimmed.match(/^Команда (\d+)$/))) return text.replace(trimmed, `Team ${m[1]}`);
      if ((m = trimmed.match(/^Мобы (\d+)$/))) return text.replace(trimmed, `Enemies ${m[1]}`);
      if ((m = trimmed.match(/^Раунд (\d+)$/))) return text.replace(trimmed, `Round ${m[1]}`);
      if ((m = trimmed.match(/^ход (\d+)$/))) return text.replace(trimmed, `turn ${m[1]}`);
      if ((m = trimmed.match(/^(\d+) (?:игрок|игрока|игроков)$/))) return text.replace(trimmed, `${m[1]} ${Number(m[1]) === 1 ? 'player' : 'players'}`);
      return translateCompound(text, lang);
    }

    // lang === 'ru'
    if (en2ru[text]) return en2ru[text];
    if (en2ru[trimmed]) return text.replace(trimmed, en2ru[trimmed]);

    let m;
    if ((m = trimmed.match(/^Ready (\d+) of (\d+)$/))) return text.replace(trimmed, `Готово ${m[1]} из ${m[2]}`);
    if ((m = trimmed.match(/^Waiting: (.*)$/))) return text.replace(trimmed, `Ожидание: ${m[1]}`);
    if ((m = trimmed.match(/^Cell (\d+),\s*(\d+)$/))) return text.replace(trimmed, `Клетка ${m[1]}, ${m[2]}`);
    if ((m = trimmed.match(/^Team (\d+)$/))) return text.replace(trimmed, `Команда ${m[1]}`);
    if ((m = trimmed.match(/^Enemies (\d+)$/))) return text.replace(trimmed, `Мобы ${m[1]}`);
    if ((m = trimmed.match(/^Round (\d+)$/))) return text.replace(trimmed, `Раунд ${m[1]}`);
    if ((m = trimmed.match(/^turn (\d+)$/))) return text.replace(trimmed, `ход ${m[1]}`);
    if ((m = trimmed.match(/^(\d+) players?$/))) {
      const count = Number(m[1]);
      const lastTwo = count % 100;
      const last = count % 10;
      const noun = lastTwo >= 11 && lastTwo <= 14 ? 'игроков' : last === 1 ? 'игрок' : last >= 2 && last <= 4 ? 'игрока' : 'игроков';
      return text.replace(trimmed, `${m[1]} ${noun}`);
    }
    return translateCompound(text, lang);
  }

  // Translate dynamic game data in memory
  function applyGameDataLanguage(lang) {
    if (typeof window === 'undefined' || !window.GAME_DATA) return;
    const data = window.GAME_DATA;

    // Enemies
    if (data.enemies) {
      Object.values(data.enemies).forEach(e => {
        if (!e._orig_name) e._orig_name = e.name;
        if (!e._orig_short) e._orig_short = e.shortName;
        if (!e._orig_desc) e._orig_desc = e.description;

        if (lang === 'ru') {
          e.name = en2ru[e._orig_name] || e._orig_name;
          e.shortName = en2ru[e._orig_short] || e._orig_short;
          e.description = t(e._orig_desc, 'ru');
        } else {
          e.name = e._orig_name;
          e.shortName = e._orig_short;
          e.description = e._orig_desc;
        }
      });
    }

    // Heroes
    if (data.heroes) {
      Object.values(data.heroes).forEach(h => {
        if (!h._orig_name) h._orig_name = h.heroName;
        if (!h._orig_title) h._orig_title = h.classTitle;
        if (!h._orig_desc) h._orig_desc = h.description;

        if (lang === 'ru') {
          h.heroName = en2ru[h._orig_name] || h._orig_name;
          h.classTitle = en2ru[h._orig_title] || h._orig_title;
          h.description = t(h._orig_desc, 'ru');
        } else {
          h.heroName = h._orig_name;
          h.classTitle = h._orig_title;
          h.description = h._orig_desc;
        }

        [...(h.skills || []), ...(h.ultimate ? [h.ultimate] : [])].forEach(s => {
          if (!s._orig_name) s._orig_name = s.name;
          if (!s._orig_desc) s._orig_desc = s.desc;
          if (lang === 'ru') {
            s.name = en2ru[s._orig_name] || s._orig_name;
            s.desc = t(s._orig_desc, 'ru');
          } else {
            s.name = s._orig_name;
            s.desc = s._orig_desc;
          }
        });
      });
    }

    (data.presetWaves || []).forEach(wave => {
      for (const prop of ['title', 'desc']) {
        const original = '_orig_' + prop;
        if (!Object.hasOwn(wave, original)) wave[original] = wave[prop];
        wave[prop] = t(wave[original], lang);
      }
    });

    // Towers
    function translateTowerMap(towers) {
      if (!towers) return;
      Object.values(towers).forEach(tw => {
        if (!tw._orig_name) tw._orig_name = tw.name;
        if (!tw._orig_desc) tw._orig_desc = tw.description;
        if (!tw._orig_short) tw._orig_short = tw.shortName;

        if (lang === 'ru') {
          tw.name = en2ru[tw._orig_name] || tw._orig_name;
          if (tw.shortName) tw.shortName = en2ru[tw._orig_short] || tw._orig_short;
          tw.description = en2ru[tw._orig_desc] || t(tw._orig_desc, 'ru');
        } else {
          tw.name = tw._orig_name;
          if (tw.shortName) tw.shortName = tw._orig_short;
          tw.description = tw._orig_desc;
        }

        (tw.abilities || []).forEach(a => {
          if (!a._orig_name) a._orig_name = a.name;
          if (!a._orig_desc) a._orig_desc = a.description || a.desc;
          if (lang === 'ru') {
            a.name = en2ru[a._orig_name] || a._orig_name;
            if (a.description) a.description = en2ru[a._orig_desc] || t(a._orig_desc, 'ru');
            if (a.desc) a.desc = en2ru[a._orig_desc] || t(a._orig_desc, 'ru');
          } else {
            a.name = a._orig_name;
            if (a.description) a.description = a._orig_desc;
            if (a.desc) a.desc = a._orig_desc;
          }
        });

        (tw.upgrades || []).forEach(u => {
          if (!u._orig_name) u._orig_name = u.name;
          if (!u._orig_desc) u._orig_desc = u.desc;
          if (lang === 'ru') {
            u.name = en2ru[u._orig_name] || u._orig_name;
            u.desc = en2ru[u._orig_desc] || t(u._orig_desc, 'ru');
          } else {
            u.name = u._orig_name;
            u.desc = u._orig_desc;
          }
        });
      });
    }

    if (data.towers) {
      translateTowerMap(data.towers);
    }
    if (typeof window !== 'undefined' && window.TOWER_CATALOG_DATA && window.TOWER_CATALOG_DATA.TOWERS) {
      translateTowerMap(window.TOWER_CATALOG_DATA.TOWERS);
    }

    // Tower Draft Catalog
    if (typeof window !== 'undefined' && window.TOWER_DRAFT_CATALOG) {
      const catalog = window.TOWER_DRAFT_CATALOG;
      (catalog.TOWERS || []).forEach(tw => {
        ['name', 'subtitle', 'progressionLabel', 'targets', 'description', 'synergy', 'evolutionPreview'].forEach(prop => {
          const origKey = '_orig_' + prop;
          if (!tw[origKey] && tw[prop]) tw[origKey] = tw[prop];
          if (tw[origKey]) {
            tw[prop] = lang === 'ru' ? (en2ru[tw[origKey]] || t(tw[origKey], 'ru')) : tw[origKey];
          }
        });
        (tw.levels || []).forEach(l => {
          if (!l._orig_name) l._orig_name = l.name;
          if (!l._orig_note) l._orig_note = l.note;
          l.name = lang === 'ru' ? (en2ru[l._orig_name] || l._orig_name) : l._orig_name;
          if (l.note) l.note = lang === 'ru' ? (en2ru[l._orig_note] || t(l._orig_note, 'ru')) : l._orig_note;
        });
        (tw.effects || []).forEach(e => {
          if (!e._orig_name) e._orig_name = e.name;
          if (!e._orig_desc) e._orig_desc = e.desc;
          if (lang === 'ru') {
            e.name = en2ru[e._orig_name] || e._orig_name;
            e.desc = en2ru[e._orig_desc] || t(e._orig_desc, 'ru');
          } else {
            e.name = e._orig_name;
            e.desc = e._orig_desc;
          }
        });
      });
      (catalog.PRESETS || []).forEach(p => {
        if (!p._orig_name) p._orig_name = p.name;
        if (!p._orig_desc) p._orig_desc = p.desc;
        if (lang === 'ru') {
          p.name = en2ru[p._orig_name] || p._orig_name;
          p.desc = en2ru[p._orig_desc] || t(p._orig_desc, 'ru');
        } else {
          p.name = p._orig_name;
          p.desc = p._orig_desc;
        }
      });
    }
  }

  function walkTextNodes(node, callback) {
    if (!node) return;
    const nodeType = node.nodeType;
    if (nodeType === 1) { // ELEMENT_NODE
      const tag = (node.tagName || '').toUpperCase();
      if (['SCRIPT', 'STYLE', 'PRE', 'CODE', 'TEXTAREA'].includes(tag)) return;
      if (node.id === 'log-box' || node.id === 'debug-log-box' || (node.classList && (node.classList.contains('no-i18n') || node.classList.contains('no-translate')))) return;
      if (tag === 'OPTION') {
        callback(node, true);
        return;
      }
    } else if (nodeType === 3) { // TEXT_NODE
      callback(node, false);
      return;
    }
    if (node.firstChild) {
      for (let child = node.firstChild; child; child = child.nextSibling) {
        walkTextNodes(child, callback);
      }
    } else if (node.childNodes && node.childNodes.length) {
      for (let i = 0; i < node.childNodes.length; i++) {
        walkTextNodes(node.childNodes[i], callback);
      }
    }
  }

  // Translate all marked or suitable static elements in the DOM
  const domTranslations = new WeakMap();
  function translateValue(node, key, value, lang) {
    let records = domTranslations.get(node);
    if (!records) {
      records = {};
      domTranslations.set(node, records);
    }
    let record = records[key];
    if (!record || value !== record.rendered) record = { source: value };
    record.rendered = t(record.source, lang);
    records[key] = record;
    return record.rendered;
  }

  function translateDOM(root, lang) {
    if (!root || typeof document === 'undefined') return;
    function excluded(node) {
      for (let current = node; current; current = current.parentNode) {
        if (['SCRIPT', 'STYLE', 'PRE', 'CODE', 'TEXTAREA'].includes((current.tagName || '').toUpperCase()) ||
            current.id === 'log-box' || current.id === 'debug-log-box' ||
            (current.classList && (current.classList.contains('no-i18n') || current.classList.contains('no-translate')))) return true;
      }
      return false;
    }
    // Textareas keep their user-entered value; their placeholder can be translated.
    if (excluded(root) && (root.tagName || '').toUpperCase() !== 'TEXTAREA') return;

    if (root.nodeType === 1) {
      // Include the root: observers often receive a newly inserted input/button.
      const elements = [root, ...root.querySelectorAll('[placeholder], [title], [aria-label]')];
      elements.forEach(el => {
        if (excluded(el) && (el.tagName || '').toUpperCase() !== 'TEXTAREA') return;
        for (const attr of ['placeholder', 'title', 'aria-label']) {
          if (!el.hasAttribute(attr)) continue;
          const value = el.getAttribute(attr);
          const translated = translateValue(el, attr, value, lang);
          if (translated !== value) el.setAttribute(attr, translated);
        }
      });
    }

    // Walk all text nodes
    walkTextNodes(root, (node, isOption) => {
      const raw = isOption ? node.textContent : node.nodeValue;
      if (!raw) return;
      if (!raw.trim() || !/[a-zA-Zа-яА-ЯёЁ]/.test(raw)) return;
      const updated = translateValue(node, 'text', raw, lang);
      if (updated === raw) return;
      if (isOption) node.textContent = updated;
      else node.nodeValue = updated;
    });
  }

  let observer = null;
  let isTranslating = false;

  function initObserver() {
    if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
    if (observer) return;
    observer = new MutationObserver((mutations) => {
      if (isTranslating || getLang() !== 'ru') return;
      isTranslating = true;
      try {
        for (const m of mutations) {
          if (m.type === 'characterData' || m.type === 'attributes') translateDOM(m.target, 'ru');
          for (const added of m.addedNodes || []) {
            if (added.nodeType === 1 || added.nodeType === 3) {
              translateDOM(added, 'ru');
            }
          }
        }
      } finally {
        isTranslating = false;
      }
    });
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true, characterData: true,
        attributes: true, attributeFilter: ['placeholder', 'title', 'aria-label'] });
    }
  }

  function applyLanguage(lang) {
    lang = lang || getLang();
    if (typeof document === 'undefined') return;

    document.documentElement.lang = lang;
    document.title = translateValue(document, 'title', document.title, lang);

    // 1. Update Game Data
    applyGameDataLanguage(lang);

    // 2. Translate DOM
    translateDOM(document.body, lang);

    // 3. Update Switcher Buttons
    document.querySelectorAll('.kr-lang-btn').forEach(btn => {
      if (btn.dataset.lang === lang) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // 4. Trigger UI re-renders if handlers exist
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('kr6:langchange', { detail: { lang } }));
      if (typeof window.renderGrid === 'function' && window.lastReceivedState) {
        try { window.renderGrid(window.lastReceivedState); } catch(e) {}
      }
      if (typeof window.updateUI === 'function' && window.lastState) {
        try { window.updateUI(window.lastState); } catch(e) {}
      }
      if (typeof window.renderHeroSetup === 'function') {
        try { window.renderHeroSetup(); } catch(e) {}
      }
    }
  }

  function renderSwitcher(container) {
    if (!container) return;
    const currentLang = getLang();
    container.innerHTML = `
      <div class="kr-lang-switch" role="group" aria-label="Language">
        <button type="button" class="kr-lang-btn ${currentLang === 'en' ? 'active' : ''}" data-lang="en">EN</button>
        <button type="button" class="kr-lang-btn ${currentLang === 'ru' ? 'active' : ''}" data-lang="ru">RU</button>
      </div>
    `;
    container.querySelectorAll('.kr-lang-btn').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        setLang(this.dataset.lang);
      });
    });
  }

  // Auto-init on DOMContentLoaded
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('DOMContentLoaded', function() {
      // Find language switcher containers or create one
      document.querySelectorAll('.lang-switcher-slot').forEach(renderSwitcher);
      initObserver();

      // Apply initial language
      const lang = getLang();
      if (lang === 'ru') {
        applyLanguage('ru');
      }
    });
  }

  function _tr(text) {
    return t(text);
  }
  if (typeof window !== 'undefined') {
    window._tr = _tr;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis._tr = _tr;
  }

  const i18n = {
    getLang,
    setLang,
    t,
    applyLanguage,
    applyGameDataLanguage,
    translateDOM,
    renderSwitcher
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = i18n;
  }
  if (typeof window !== 'undefined') {
    window.KR_I18N = i18n;
  }
})();
