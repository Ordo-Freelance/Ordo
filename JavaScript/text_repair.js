(function(root){
  'use strict';

  var BAD = /â|Â|آ·|ï¸|ًں|�|ط³ظ|ظ†|ظ„|ط±ط³|ط¬ط¯|\?/;
  var ATTRS = ['title','placeholder','aria-label','alt'];
  var scheduled = false;

  var replacements = [
    [/آ·|Â·/g, '·'],
    [/â€”/g, '—'],
    [/â€“/g, '–'],
    [/â€¦/g, '…'],
    [/â„¢/g, '™'],
    [/â€ک|â€‌/g, "'"],
    [/â€œ|â€‌/g, '"'],
    [/â€‌|â€‌/g, '"'],
    [/â†©/g, '↩'],
    [/â†گ|â†’/g, '→'],
    [/â†؛/g, '↻'],
    [/â¬†/g, '⬆'],
    [/â—ڈ/g, '●'],
    [/â­گ/g, '★'],
    [/âک…/g, '★'],
    [/âک†/g, '☆'],
    [/âœ“|âœ”/g, '✓'],
    [/âœڈï¸ڈ|âœڈ/g, '✎'],
    [/âڈ¸/g, '⏸'],
    [/âڈ³/g, '⏳'],
    [/âڈ°/g, '⏰'],
    [/âڑ ï¸ڈ|âڑ /g, '⚠'],
    [/âڑ،/g, '⚡'],
    [/â›½/g, '⛽'],
    [/âک•/g, '☕'],
    [/ًں‘‹/g, '👋'],
    [/ًں™ڈ/g, '🙏'],
    [/ًں’°/g, '💰'],
    [/ًں†”/g, '🆔'],
    [/ًں†•/g, '🆕'],
    [/ًں”چ/g, '🔍'],
    [/ًں”—/g, '🔗'],
    [/ًں“پ/g, '📁'],
    [/ًں“¦/g, '📦'],
    [/ًں“„/g, '📄'],
    [/ًں“‹/g, '📋'],
    [/ًں“…/g, '📅'],
    [/ًں‘¤/g, '👤'],
    [/ًں“ڈ/g, '📊'],
    [/ًں“‌/g, '🏷'],
    [/ًںچ½/g, '🍽'],
    [/ًںک‍|ًںکگ|ًں™‚/g, '🙂'],
    [/ًںکٹ|ًں¤©/g, '🤩'],
    [/ًںں¢/g, '🟢'],
    [/ًںں،/g, '🟡'],
    [/ط³ظ†بدأ/g, 'سنبدأ'],
    [/ظ†فيدك/g, 'نفيدك'],
    [/ظ„لاستفسار/g, 'للاستفسار'],
    [/ط±ط³ط§ظ„ط© ط¬ط¯ظٹط¯ط©/g, 'رسالة جديدة'],
    [/ط¢/g, ''],
    [/ï¸ڈ/g, ''],
    [/�+/g, '']
  ];

  function cleanText(value){
    if(value == null) return value;
    var out = String(value);
    if(!BAD.test(out)) return value;
    replacements.forEach(function(pair){ out = out.replace(pair[0], pair[1]); });
    out = out
      .replace(/(^|\s)\?\s*مكتمل/g, '$1✓ مكتمل')
      .replace(/(^|\s)\?\s*Done/g, '$1✓ Done')
      .replace(/([\u0600-\u06FF\w\)\]\}])\s+\?\s+([\u0600-\u06FF\w\(\[\{])/g, '$1 · $2')
      .replace(/ًں[^\s،؛,.!؟)\]]*/g, '')
      .replace(/â[^\s،؛,.!؟)\]]*/g, '')
      .replace(/\s{2,}/g, ' ')
      .trimStart();
    return out;
  }

  function shouldSkip(el){
    if(!el) return false;
    return /SCRIPT|STYLE|TEXTAREA|INPUT|SELECT|OPTION|CANVAS/.test(el.tagName || '');
  }

  function repairNode(rootNode){
    rootNode = rootNode || document.body;
    if(!rootNode) return;

    if(rootNode.nodeType === Node.TEXT_NODE) {
      if(rootNode.parentElement && !shouldSkip(rootNode.parentElement)) {
        var fixed = cleanText(rootNode.nodeValue);
        if(fixed !== rootNode.nodeValue) rootNode.nodeValue = fixed;
      }
      return;
    }

    if(rootNode.nodeType !== Node.ELEMENT_NODE && rootNode.nodeType !== Node.DOCUMENT_NODE) return;

    var element = rootNode.nodeType === Node.ELEMENT_NODE ? rootNode : null;
    if(element && !shouldSkip(element)) {
      ATTRS.forEach(function(attr){
        if(!element.hasAttribute || !element.hasAttribute(attr)) return;
        var val = element.getAttribute(attr);
        var fixed = cleanText(val);
        if(fixed !== val) element.setAttribute(attr, fixed);
      });
    }

    var walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT, {
      acceptNode:function(node){
        var val = node.nodeValue || '';
        if(!BAD.test(val)) return NodeFilter.FILTER_REJECT;
        if(shouldSkip(node.parentElement)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var nodes = [], node;
    while((node = walker.nextNode())) nodes.push(node);
    nodes.forEach(function(textNode){
      var fixed = cleanText(textNode.nodeValue);
      if(fixed !== textNode.nodeValue) textNode.nodeValue = fixed;
    });

    if(rootNode.querySelectorAll) {
      rootNode.querySelectorAll('[title],[placeholder],[aria-label],[alt]').forEach(function(el){
        if(shouldSkip(el) && el.tagName !== 'INPUT') return;
        ATTRS.forEach(function(attr){
          if(!el.hasAttribute(attr)) return;
          var val = el.getAttribute(attr);
          var fixed = cleanText(val);
          if(fixed !== val) el.setAttribute(attr, fixed);
        });
      });
    }
  }

  function repairAll(){
    scheduled = false;
    repairNode(document.body);
    var title = cleanText(document.title);
    if(title !== document.title) document.title = title;
  }

  function schedule(){
    if(scheduled) return;
    scheduled = true;
    setTimeout(repairAll, 30);
  }

  root.OrdoTextRepair = { cleanString: cleanText, repair: repairAll };

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', repairAll);
  else repairAll();

  try {
    new MutationObserver(function(mutations){
      for(var i=0;i<mutations.length;i++){
        if(mutations[i].addedNodes && mutations[i].addedNodes.length) {
          schedule();
          return;
        }
        if(mutations[i].type === 'characterData') {
          schedule();
          return;
        }
      }
    }).observe(document.documentElement, {childList:true, subtree:true, characterData:true});
  } catch(e) {}
})(window);
