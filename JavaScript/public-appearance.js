(function(root){
  function valid(color){return /^#[0-9a-f]{6}$/i.test(color||'');}
  function mix(a,b,ratio){
    return '#'+[1,3,5].map(function(i){
      var x=parseInt(a.slice(i,i+2),16),y=parseInt(b.slice(i,i+2),16);
      return Math.round(x*(1-ratio)+y*ratio).toString(16).padStart(2,'0');
    }).join('');
  }
  root.applyOrdoPublicAppearance=function(settings){
    settings=settings||{};
    var mode=settings.displayMode||settings.display_mode||'dark';
    var theme=settings.appearanceThemes?.[mode]||(!settings.appearanceThemes?settings:null);
    if(!theme||!valid(theme.toneColor))return;
    var first=theme.toneColor,second=valid(theme.toneGradientEnd)?theme.toneGradientEnd:first;
    var light=mode==='light';
    function contrast(color){
      var rgb=[1,3,5].map(function(i){return parseInt(color.slice(i,i+2),16);});
      var brightness=(rgb[0]*299+rgb[1]*587+rgb[2]*114)/1000;
      return light&&brightness<170?mix(color,'#ffffff',.75):!light&&brightness>115?mix(color,'#0d1425',.72):color;
    }
    first=contrast(first);second=contrast(second);
    var angle=Math.max(0,Math.min(360,Number(theme.toneAngle)||135));
    var body=root.document.body,html=root.document.documentElement;
    var background=theme.toneStyle==='gradient'?'linear-gradient('+angle+'deg,'+first+','+second+')':first;
    var surface=mix(first,'#ffffff',light?.88:.08),surface2=mix(first,'#ffffff',light?.76:.14);
    [html,body].forEach(function(el){
      el.style.setProperty('--bg',first);
      el.style.setProperty('--s1',surface);el.style.setProperty('--s2',surface2);
      el.style.setProperty('--surface',surface);el.style.setProperty('--surface2',surface2);
      el.style.setProperty('--public-page-bg',background);
      el.style.setProperty('--public-surface',surface);
    });
    var style=root.document.getElementById('ordo-public-appearance');
    if(!style){
      style=root.document.createElement('style');
      style.id='ordo-public-appearance';
      root.document.head.appendChild(style);
    }
    style.textContent='body{background:var(--public-page-bg,var(--bg)) fixed!important}'+
      'header,.nav,.ftr,footer,.top-band,.site-footer{background:var(--public-surface,var(--surface))!important;border-color:color-mix(in srgb,var(--public-surface) 76%,white)!important}';
  };
})(window);
