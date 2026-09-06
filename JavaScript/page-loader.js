(function(root){
  'use strict';
  var loaded = {};
  var modules = {
    finance: '../JavaScript/finance.page.js'
  };

  root.OrdoPageModules = root.OrdoPageModules || {};

  root.loadOrdoPageModule = function(pageId){
    var src = modules[pageId];
    if(!src || loaded[pageId]) return Promise.resolve(root.OrdoPageModules[pageId] || null);
    loaded[pageId] = true;
    return new Promise(function(resolve, reject){
      var s = document.createElement('script');
      s.src = src + '?v=calendar-polish-37';
      s.defer = true;
      s.onload = function(){ resolve(root.OrdoPageModules[pageId] || null); };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  };
})(window);
