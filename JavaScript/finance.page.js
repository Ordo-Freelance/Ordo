(function(root){
  'use strict';
  root.OrdoPageModules = root.OrdoPageModules || {};
  root.OrdoPageModules.finance = {
    mount: function(){
      if(root.__financeV3ShowPagePatched) return;
      if(typeof root.renderFinance === 'function') root.renderFinance();
    }
  };
})(window);
