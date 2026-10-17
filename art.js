'use strict';
// 全部插画都是代码画的矢量图（SVG）：角色立绘 + 场景。没有任何外部图片，离线也能显示。
const ART = (() => {
  const LITE_ART = typeof navigator !== 'undefined' && (/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || (navigator.hardwareConcurrency || 8) <= 4);
  let uid = 0;
  const rng = (seed) => { let s = seed * 9301 + 49297; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; };

  // ---------------------------------------------------------------- 角色立绘
  const HEAD = 'M62 92C62 62 80 50 100 50C120 50 138 62 138 92C138 118 124 146 100 148C76 146 62 118 62 92Z';
  const BODY = 'M6 240C10 196 46 172 84 162L116 162C154 172 190 196 194 240Z';
  const THEME = {
    han: '#4a3470', chen: '#2d3547', lin: '#1f5560', fang: '#5a4426', su: '#5a2d45',
    zhouwan: '#21544a', zhouming: '#5a2626', zhao: '#5a4a1e', victim: '#3a3a3a', none: '#26324d'
  };
  const SKIN = {
    han: ['#f0cfae', '#cf9f7c'], chen: ['#ecc7a3', '#c99774'], lin: ['#e9c39c', '#c4946f'],
    fang: ['#e2b18a', '#b98260'], su: ['#f6dcc0', '#d9a98a'], zhouwan: ['#f7dcc4', '#dcae92'],
    zhouming: ['#eec3a0', '#c8967a'], zhao: ['#e5b088', '#b9805c'], victim: ['#e6c9ab', '#bd9878'], none: ['#8a97b3', '#6a7692']
  };

  const eyes = (c, o = {}) => {
    const col = o.iris || '#2a1c14', lid = o.lid || 0;
    const eye = (x) => `<g><ellipse cx="${x}" cy="97" rx="6" ry="${3.9 - lid}" fill="#f6f1e8"/><circle cx="${x}" cy="97.4" r="3" fill="${col}"/><circle cx="${x}" cy="97.4" r="1.4" fill="#0a0806"/><circle cx="${x + 1.2}" cy="96.2" r=".9" fill="#fff"/>
      <path d="M${x - 6.5} ${96 - lid * 0.6}Q${x} ${92.5 - lid}, ${x + 6.5} ${96 - lid * 0.6}" stroke="#2a1c14" stroke-width="1.7" fill="none" stroke-linecap="round"/></g>`;
    return eye(84) + eye(116);
  };
  const brows = (col, o = {}) => {
    const y = o.y || 85, a = o.arch == null ? 3 : o.arch, tilt = o.tilt || 0, w = o.w || 3, lr = o.lr || 0;
    return `<path d="M72 ${y + tilt - lr}Q83 ${y - a - lr} 94 ${y - tilt - lr + 1}" stroke="${col}" stroke-width="${w}" fill="none" stroke-linecap="round"/>
      <path d="M106 ${y - tilt + 1}Q117 ${y - a} 128 ${y + tilt}" stroke="${col}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;
  };
  const nose = (dark) => `<path d="M100 98Q95 112 93 114Q100 118 107 114" stroke="${dark}" stroke-width="1.8" fill="none" stroke-linecap="round" opacity=".7"/>
    <ellipse cx="100" cy="116" rx="9" ry="3" fill="${dark}" opacity=".12"/>`;
  const cheeks = (o = 0.14) => `<ellipse cx="76" cy="112" rx="9" ry="6" fill="#e07a6a" opacity="${o}"/><ellipse cx="124" cy="112" rx="9" ry="6" fill="#e07a6a" opacity="${o}"/>`;
  const mouth = (d, col = '#7a4636', w = 2.2) => `<path d="${d}" stroke="${col}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;

  function portraitInner(id, u) {
    const [sk1, sk2] = SKIN[id] || SKIN.none;
    const th = THEME[id] || THEME.none;
    const skin = `<linearGradient id="sk${u}" x1="0" x2="1"><stop offset="0" stop-color="${sk1}"/><stop offset=".62" stop-color="${sk1}"/><stop offset="1" stop-color="${sk2}"/></linearGradient>`;
    const bg = `<radialGradient id="bg${u}" cx=".5" cy=".36" r=".85"><stop offset="0" stop-color="${th}" stop-opacity="1"/><stop offset=".6" stop-color="${th}" stop-opacity=".55"/><stop offset="1" stop-color="#05070d"/></radialGradient>
      <linearGradient id="vg${u}" x1="0" y1="0" x2="0" y2="1"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></linearGradient>
      <radialGradient id="rim${u}" cx=".18" cy=".3" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`;
    const backdrop = `<rect width="200" height="240" fill="url(#bg${u})"/>
      <g opacity=".16" fill="#fff"><circle cx="30" cy="40" r="16"/><circle cx="168" cy="30" r="10"/><circle cx="176" cy="92" r="22"/><circle cx="20" cy="130" r="9"/></g>`;
    const neck = `<path d="M86 134h28v32c-8 7-20 7-28 0z" fill="${sk2}"/><ellipse cx="100" cy="150" rx="24" ry="9" fill="#000" opacity=".16"/>`;
    const ears = `<ellipse cx="62" cy="99" rx="5.5" ry="10" fill="${sk2}"/><ellipse cx="138" cy="99" rx="5.5" ry="10" fill="${sk2}"/>`;
    const head = `<path d="${HEAD}" fill="url(#sk${u})"/>`;
    const finish = `<rect width="200" height="240" fill="url(#rim${u})"/><rect width="200" height="240" fill="url(#vg${u})"/>`;
    const defs = `<defs>${skin}${bg}</defs>`;
    let back = '', body = '', front = '', face = '';
    const nz = nose(sk2);

    switch (id) {
      case 'han': // 律师：背头、金丝眼镜、暗红领带
        body = `<path d="${BODY}" fill="#1c2336"/><path d="M86 162L100 210L114 162Z" fill="#ebe7df"/>
          <path d="M84 162L100 210L76 234L52 190Z" fill="#273252"/><path d="M116 162L100 210L124 234L148 190Z" fill="#273252"/>
          <path d="M86 160l14 14-13 5z M114 160l-14 14 13 5z" fill="#fff"/>
          <path d="M95 170h10l-2 9h-6z" fill="#7a1f2b"/><path d="M96 179h8l6 44-10 8-10-8z" fill="#8c2433"/>
          <path d="M132 204l12-4 3 9-13 2z" fill="#d4af37"/>`;
        face = brows('#15171e', { y: 84, tilt: 0.6, lr: 1.2 }) + eyes(0, { iris: '#2b2118' }) + nz + cheeks(.08) + mouth('M90 127Q101 133 112 123', '#7a4636') +
          `<path d="M112 123l3-2" stroke="#7a4636" stroke-width="1.4" stroke-linecap="round"/>`;
        front = `<path d="M60 92C54 58 76 38 102 38C130 38 148 60 140 94C138 80 134 68 124 62C112 70 86 70 70 66C64 72 62 82 60 92Z" fill="#15171e"/>
          <path d="M78 52C92 46 114 46 128 54M84 60C98 55 114 56 126 62" stroke="#3a3f55" stroke-width="2" fill="none" stroke-linecap="round"/>
          <g fill="rgba(190,215,255,.14)" stroke="#d4af37" stroke-width="1.8"><rect x="72" y="87" width="23" height="16" rx="4"/><rect x="105" y="87" width="23" height="16" rx="4"/></g>
          <path d="M95 93h10M72 92l-10 2M128 92l10 2" stroke="#d4af37" stroke-width="1.6" fill="none"/>
          <path d="M76 90l8 3M110 90l8 3" stroke="#fff" stroke-width="1" opacity=".5"/>`;
        break;
      case 'chen': // 管家：白发、白胡须、黑燕尾服
        body = `<path d="${BODY}" fill="#12141a"/><path d="M84 160h32l-3 26h-26z" fill="#f2efe8"/><path d="M88 184h24l8 56H80z" fill="#3b404c"/>
          <g fill="#c9a14a"><circle cx="100" cy="196" r="1.8"/><circle cx="100" cy="210" r="1.8"/><circle cx="100" cy="224" r="1.8"/></g>
          <path d="M84 162L100 200L66 236L46 192Z" fill="#1b1e27"/><path d="M116 162L100 200L134 236L154 192Z" fill="#1b1e27"/>
          <path d="M114 204q-14 10-24 0" stroke="#d4af37" stroke-width="1.5" fill="none"/><circle cx="90" cy="206" r="4" fill="#d4af37"/>
          <path d="M100 172L85 165V179Z M100 172L115 165V179Z" fill="#06060a"/><circle cx="100" cy="172" r="3" fill="#06060a"/>`;
        back = '';
        face = `<path d="M70 70Q100 62 130 70M72 76Q100 70 128 76" stroke="${sk2}" stroke-width="1.2" fill="none" opacity=".4"/>` +
          brows('#dfe1e6', { y: 85, w: 4.2, arch: 2.5 }) + eyes(0, { iris: '#3d4a52', lid: .4 }) + nz +
          `<path d="M70 104q3 4 4 8M130 104q-3 4-4 8" stroke="${sk2}" stroke-width="1.2" fill="none" opacity=".5"/>` +
          mouth('M93 131Q100 135 107 131', '#7a4636', 1.8) +
          `<path d="M84 119Q100 111 116 119Q109 126 100 122Q91 126 84 119Z" fill="#e9ebee"/>`;
        front = `<path d="M62 88C58 70 62 60 72 58C68 70 68 82 70 96Z M138 88C142 70 138 60 128 58C132 70 132 82 130 96Z" fill="#d3d6dc"/>
          <path d="M72 58C86 49 114 49 128 58C116 55 84 55 72 58Z" fill="#d3d6dc"/><path d="M80 56Q100 50 120 56" stroke="#fff" stroke-width="2" opacity=".6" fill="none"/>`;
        break;
      case 'lin': // 医生：圆框眼镜、白大褂、听诊器
        body = `<path d="${BODY}" fill="#dfe6eb"/><path d="M88 162L100 192L112 162Z" fill="#5f86a8"/>
          <path d="M84 162L96 204L70 220L50 182Z" fill="#f5f8fa"/><path d="M116 162L104 204L130 220L150 182Z" fill="#f5f8fa"/>
          <path d="M80 168C70 202 90 218 100 212C110 218 130 202 120 168" stroke="#4b535d" stroke-width="3.2" fill="none" stroke-linecap="round"/>
          <circle cx="100" cy="214" r="6.5" fill="#b8c0c9" stroke="#4b535d" stroke-width="2"/>
          <rect x="140" y="208" width="22" height="26" rx="3" fill="#e9eff3" stroke="#c4ced6"/><path d="M148 208v-8M154 208v-6" stroke="#c0392b" stroke-width="2.4" stroke-linecap="round"/>`;
        face = brows('#4a4038', { y: 86, tilt: -1.2, w: 2.8 }) + eyes(0, { iris: '#44352a', lid: .8 }) +
          `<ellipse cx="84" cy="103" rx="8" ry="2.4" fill="#7a5a8a" opacity=".28"/><ellipse cx="116" cy="103" rx="8" ry="2.4" fill="#7a5a8a" opacity=".28"/>` + nz +
          mouth('M92 129Q100 127 108 129', '#7a4636', 2) +
          `<g fill="#4a4038" opacity=".25"><circle cx="82" cy="128" r=".8"/><circle cx="88" cy="134" r=".8"/><circle cx="100" cy="137" r=".8"/><circle cx="112" cy="134" r=".8"/><circle cx="118" cy="128" r=".8"/></g>`;
        front = `<path d="M62 90C58 60 78 44 100 44C124 44 142 60 138 90C134 74 126 64 112 62C96 66 74 66 66 76Z" fill="#6c5f54"/>
          <path d="M62 90C60 78 62 70 66 66L68 90Z M138 90C140 78 138 70 134 66L132 90Z" fill="#b2aca3"/>
          <g fill="rgba(180,210,230,.16)" stroke="#2f343b" stroke-width="2"><circle cx="84" cy="97" r="12.5"/><circle cx="116" cy="97" r="12.5"/></g>
          <path d="M96.5 95Q100 92 103.5 95M71.5 95L62 93M128.5 95L138 93" stroke="#2f343b" stroke-width="1.8" fill="none"/>
          <path d="M76 90q4-3 8-3" stroke="#fff" stroke-width="1.2" opacity=".55" fill="none" stroke-linecap="round"/>`;
        break;
      case 'fang': // 旧合伙人：鸭舌帽、灰胡子、围巾、粗呢外套
        body = `<path d="${BODY}" fill="#5b4634"/>
          <g stroke="#3d2e21" stroke-width="1" opacity=".6">${Array.from({ length: 22 }, (_, i) => `<path d="M${20 + (i * 37) % 160} ${176 + (i * 53) % 60}l6 4"/>`).join('')}</g>
          <path d="M78 156C90 174 110 174 122 156L132 184C114 196 86 196 68 184Z" fill="#2f4a3c"/><path d="M76 170C90 182 110 182 126 170M72 180C88 192 112 192 130 180" stroke="#9a3b30" stroke-width="3" fill="none" opacity=".85"/>`;
        face = brows('#8f8d89', { y: 87, tilt: 2.6, w: 4 }) + eyes(0, { iris: '#35383c', lid: .5 }) + nz +
          `<path d="M64 108C62 134 78 154 100 156C122 154 138 134 136 108C132 124 120 132 100 132C80 132 68 124 64 108Z" fill="#bab8b3"/>
           <path d="M84 120Q100 112 116 120Q108 128 100 125Q92 128 84 120Z" fill="#d2d0cb"/>` + mouth('M94 133Q100 135 106 133', '#6a4a3e', 1.6) +
          `<path d="M72 94q-1 8 1 12M128 94q1 8-1 12" stroke="${sk2}" stroke-width="1.3" fill="none" opacity=".6"/>`;
        front = `<path d="M62 86C62 56 92 44 110 46C130 48 142 62 140 86C128 76 74 76 62 86Z" fill="#4e3d2d"/>
          <path d="M54 88C70 76 132 76 148 88C134 94 68 94 54 88Z" fill="#3b2d20"/><path d="M62 70C80 58 120 58 138 70" stroke="#6d5841" stroke-width="2" fill="none"/>
          <path d="M62 94C58 84 58 80 60 78L66 96Z M138 94C142 84 142 80 140 78L134 96Z" fill="#a3a19c"/>`;
        break;
      case 'su': // 秘书：黑色波波头、丝带领口、文件夹
        back = `<path d="M54 102C50 60 74 34 100 34C128 34 150 60 146 104C146 128 140 142 130 148L126 114L74 114L70 148C60 142 54 128 54 102Z" fill="#14121a"/>`;
        body = `<path d="${BODY}" fill="#2a3550"/><path d="M84 162L100 196L116 162L112 214L88 214Z" fill="#efe6d6"/>
          <path d="M84 162L98 200L66 232L46 190Z" fill="#33406a"/><path d="M116 162L102 200L134 232L154 190Z" fill="#33406a"/>
          <path d="M100 172L82 163V181Z M100 172L118 163V181Z" fill="#b04a5a"/><circle cx="100" cy="172" r="4" fill="#933a49"/>
          <g transform="rotate(-9 150 222)"><rect x="118" y="196" width="66" height="50" rx="3" fill="#d9c9a3"/><rect x="124" y="190" width="54" height="10" fill="#fbfaf6"/><path d="M130 214h40M130 222h30" stroke="#a89a78" stroke-width="2"/></g>`;
        face = brows('#14121a', { y: 85, tilt: 1.8, arch: 4, w: 2.4 }) + eyes(0, { iris: '#3a2a22' }) +
          `<path d="M77 90l-3-2M123 90l3-2" stroke="#14121a" stroke-width="1.6" stroke-linecap="round"/>` + nz + cheeks(.2) +
          `<path d="M92 126Q100 131 108 126Q100 135 92 126Z" fill="#b23a48"/><path d="M92 126Q100 123 108 126" stroke="#8c2a36" stroke-width="1.2" fill="none"/>`;
        front = `<path d="M62 92C62 64 82 52 100 52C118 52 138 64 138 92C124 80 112 72 100 74C88 72 76 80 62 92Z" fill="#14121a"/>
          <path d="M72 66C84 58 100 56 116 60" stroke="#58507a" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".7"/>
          <circle cx="62" cy="110" r="3.2" fill="#f4f0ea"/><circle cx="138" cy="110" r="3.2" fill="#f4f0ea"/>`;
        break;
      case 'zhouwan': // 独女：长发、深绿大衣、奶白毛领、泪光
        back = `<path d="M50 102C44 56 72 32 100 32C130 32 156 56 150 104C152 140 152 172 160 214L130 214C132 172 134 134 130 114L70 114C66 134 68 172 70 214L40 214C48 172 48 140 50 102Z" fill="#3a2217"/>`;
        body = `<path d="${BODY}" fill="#1f4036"/>
          <path d="M58 166C74 180 126 180 142 166L156 196C132 212 68 212 44 196Z" fill="#efe8d8"/>
          <g stroke="#cdbfa3" stroke-width="1.4" opacity=".8" fill="none"><path d="M52 190q6-6 10 0M72 198q6-6 10 0M96 202q6-6 10 0M120 198q6-6 10 0M138 188q6-6 10 0"/></g>
          <g fill="#d4af37"><circle cx="100" cy="222" r="3"/><circle cx="100" cy="236" r="3"/></g>`;
        face = brows('#3a2217', { y: 85, tilt: 2.4, arch: 4, w: 2.4 }) + eyes(0, { iris: '#4a2f22' }) +
          `<ellipse cx="84" cy="98" rx="9" ry="5.5" fill="none" stroke="#d98b8b" stroke-width="1.6" opacity=".55"/><ellipse cx="116" cy="98" rx="9" ry="5.5" fill="none" stroke="#d98b8b" stroke-width="1.6" opacity=".55"/>
           <path d="M80 106q-3 7 0 10q3-3 0-10z" fill="rgba(210,235,255,.9)"/>` + nz + cheeks(.22) +
          `<path d="M93 131Q100 126 107 131" stroke="#b0584c" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
        front = `<path d="M62 90C66 62 88 50 106 50C124 52 140 66 138 92C128 74 110 66 92 70C80 74 68 82 62 90Z" fill="#3a2217"/>
          <path d="M70 70C84 58 104 56 120 60" stroke="#6b4430" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".8"/>
          <path d="M62 108v10M138 108v10" stroke="#d4af37" stroke-width="2"/><circle cx="62" cy="121" r="3" fill="#d4af37"/><circle cx="138" cy="121" r="3" fill="#d4af37"/>`;
        break;
      case 'zhouming': // 堂侄：乱发、胡茬、歪领带、扑克牌
        body = `<path d="${BODY}" fill="#25262e"/><path d="M82 162L100 202L118 162L124 220L76 220Z" fill="#dcd5c6"/>
          <path d="M82 162L96 206L66 236L42 192Z" fill="#30323d"/><path d="M118 162L104 206L134 236L158 192Z" fill="#30323d"/>
          <path d="M94 170l-12 30 8 8 12-26z" fill="#8a2a38"/><path d="M86 168Q100 194 114 168" stroke="#d4af37" stroke-width="1.8" fill="none"/>
          <g transform="rotate(14 152 214)"><rect x="132" y="184" width="38" height="54" rx="4" fill="#f7f2e7" stroke="#8d8a80"/><text x="139" y="205" font-size="17" font-weight="700" fill="#161616" font-family="Georgia,serif">A</text><text x="146" y="228" font-size="22" fill="#161616" font-family="Georgia,serif">♠</text></g>`;
        const rs = rng(7);
        face = brows('#2a1810', { y: 85, tilt: 1.5, lr: 2, arch: 4 }) + eyes(0, { iris: '#32261c', lid: 1.1 }) +
          `<path d="M77 94Q84 91 91 94M109 94Q116 91 123 94" stroke="${sk2}" stroke-width="1.4" fill="none" opacity=".7"/>` + nz + cheeks(.12) +
          `<g fill="#2a1810" opacity=".3">${Array.from({ length: 46 }, () => { const a = rs() * Math.PI, r = 30 + rs() * 12; return `<circle cx="${(100 + Math.cos(a) * r * 0.95).toFixed(1)}" cy="${(112 + Math.sin(a) * r * .58).toFixed(1)}" r=".85"/>`; }).join('')}</g>` +
          mouth('M88 127Q103 136 114 122', '#7a4636') + `<path d="M114 122l3-3" stroke="#7a4636" stroke-width="1.5" stroke-linecap="round"/>`;
        front = `<path d="M60 92C54 62 74 40 100 40C128 38 148 60 140 92C138 78 132 70 124 66L120 54L110 66L102 50L94 66L84 54L78 68C68 72 62 82 60 92Z" fill="#3b2316"/>
          <path d="M80 54l6 8M104 52l4 9M118 56l2 8" stroke="#6b4328" stroke-width="2" stroke-linecap="round"/>`;
        break;
      case 'zhao': // 厨师：高高的厨师帽、浓密八字胡、红围巾
        body = `<path d="${BODY}" fill="#f2efe9"/><path d="M100 164V240" stroke="#d6d1c6" stroke-width="2"/>
          <g fill="#bdb8ac"><circle cx="88" cy="190" r="3.4"/><circle cx="112" cy="190" r="3.4"/><circle cx="88" cy="214" r="3.4"/><circle cx="112" cy="214" r="3.4"/></g>
          <path d="M80 160L100 182L120 160L114 174L100 196L86 174Z" fill="#b23a3a"/>
          <path d="M44 208q10-6 18 2M150 222q8-8 18-2" stroke="#d9a35c" stroke-width="3" opacity=".5" fill="none" stroke-linecap="round"/>`;
        face = `<ellipse cx="66" cy="108" rx="9" ry="15" fill="url(#sk${u})"/><ellipse cx="134" cy="108" rx="9" ry="15" fill="url(#sk${u})"/>` +
          brows('#17110d', { y: 85, w: 4.4, arch: 2 }) + eyes(0, { iris: '#2b1d12' }) + nz + cheeks(.22) +
          `<path d="M92 130Q100 140 108 130" stroke="#8a4a3a" stroke-width="2" fill="#c9605a" stroke-linejoin="round"/>
           <path d="M80 121Q100 107 120 121Q112 133 100 126Q88 133 80 121Z" fill="#17110d"/>
           <circle cx="146" cy="76" r="0"/><path d="M150 82q-3 6 0 9q3-3 0-9z" fill="rgba(210,235,255,.9)"/>`;
        front = `<path d="M62 62C46 58 42 36 58 28C60 10 88 6 100 16C112 4 140 10 142 28C158 36 154 58 138 62Z" fill="#f7f5f0"/>
          <path d="M80 58q-2-24 6-40M100 58q0-24 0-38M120 58q2-24-6-40" stroke="#d9d5c9" stroke-width="2" fill="none"/>
          <path d="M60 60h80v15c-18 6-62 6-80 0z" fill="#ebe8e0"/><path d="M60 68c20 5 60 5 80 0" stroke="#cfcbbf" stroke-width="1.4" fill="none"/>`;
        break;
      case 'victim': // 死者：褪色的遗像，黑纱
        body = `<path d="${BODY}" fill="#262626"/><path d="M86 162L100 204L114 162Z" fill="#efefef"/><path d="M100 172l-12-8v14z M100 172l12-8v14z" fill="#111"/><circle cx="100" cy="172" r="3" fill="#111"/>`;
        face = brows('#d6d6d6', { y: 85, w: 3.4 }) + eyes(0, { iris: '#444', lid: .3 }) + nz + mouth('M92 129Q100 134 108 129', '#7a5a4c', 1.8) +
          `<path d="M70 106q3 4 4 8M130 106q-3 4-4 8" stroke="${sk2}" stroke-width="1.1" fill="none" opacity=".5"/>`;
        front = `<path d="M60 90C56 62 78 44 100 44C124 44 144 62 140 90C138 76 130 66 118 62C104 66 80 64 70 74Z" fill="#cfcfcf"/>
          <path d="M80 52C94 46 112 48 124 56" stroke="#fff" stroke-width="2" opacity=".6" fill="none"/>
          <path d="M0 150L70 240H0Z" fill="#000"/><path d="M0 170L56 240" stroke="#444" stroke-width="2"/>`;
        break;
      default:
        body = `<path d="${BODY}" fill="#3a4663"/>`;
        face = `<text x="100" y="116" text-anchor="middle" font-size="46" fill="#cdd6ec" font-family="Georgia,serif" opacity=".9">?</text>`;
    }
    const headLayer = id === 'none' ? '' : head + ears.replace(/<ellipse[^>]*\/>/, (m) => m);
    return defs + backdrop + back + (id === 'none' ? '' : neck) + body + (id === 'none' ? `<path d="${HEAD}" fill="url(#sk${u})"/>` : '') +
      (id === 'none' ? '' : ears + head) + face + front + finish;
  }

  const cache = new Map();
  function portrait(id, o = {}) {
    if (id && typeof id === 'object') return portraitFromLook(id, o);
    const ck = 'p|' + id + '|' + (o.crop || '') + '|' + (o.cls || '') + '|' + (o.label || '');
    if (cache.has(ck)) return cache.get(ck);
    const r = portraitRaw(id, o); cache.set(ck, r); return r;
  }
  function portraitRaw(id, o = {}) {
    const u = ++uid;
    const vb = o.crop === 'face' ? '40 30 120 120' : '0 0 200 240';
    const cls = ['portrait', 'p-' + id, o.cls || ''].join(' ');
    const filt = id === 'victim' ? ' style="filter:grayscale(.9) sepia(.25) contrast(.95)"' : '';
    return `<svg class="${cls}" viewBox="${vb}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${o.label || ''}"${filt}>${portraitInner(id, u)}</svg>`;
  }

  // ---------------------------------------------------------------- 场景
  const books = (x, y, w, h, seed) => {
    const r = rng(seed); let cx = x, out = '';
    const cols = ['#7a2e2e', '#2e4a6a', '#3d5a3a', '#8a6a2a', '#4a3a5a', '#6a3a2a', '#2a5a5a', '#9a8a6a'];
    while (cx < x + w - 6) {
      const bw = 4 + r() * 5, bh = h * (0.68 + r() * 0.3);
      out += `<rect x="${cx.toFixed(1)}" y="${(y + h - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="${cols[Math.floor(r() * cols.length)]}"/>`;
      if (r() > .6) out += `<rect x="${(cx + 1).toFixed(1)}" y="${(y + h - bh + 5).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="1.2" fill="#d4af37" opacity=".7"/>`;
      cx += bw + 0.6;
    }
    return out;
  };
  const flakes = (n, seed, w = 400) => {
    const r = rng(seed);
    return `<g fill="#fff">${Array.from({ length: n }, () => `<circle class="fl" cx="${(r() * w).toFixed(0)}" cy="0" r="${(0.6 + r() * 1.6).toFixed(1)}" opacity="${(0.4 + r() * 0.5).toFixed(2)}" style="animation-duration:${(5 + r() * 7).toFixed(1)}s;animation-delay:-${(r() * 10).toFixed(1)}s"/>`).join('')}</g>`;
  };
  const stars = (n, seed) => {
    const r = rng(seed);
    return Array.from({ length: n }, () => `<circle class="tw" cx="${(r() * 400).toFixed(0)}" cy="${(r() * 105).toFixed(0)}" r="${(0.4 + r() * 0.9).toFixed(1)}" fill="#e6edff" style="animation-delay:-${(r() * 4).toFixed(1)}s"/>`).join('');
  };
  const pine = (x, y, s, snow = true) =>
    `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-2" y="-4" width="4" height="10" fill="#0a0e18"/>
      <path d="M0-52L-16-22H16Z M0-38L-20-8H20Z M0-24L-24 8H24Z" fill="#0f1a2c"/>
      ${snow ? '<path d="M0-52L-6-41L0-43L6-41ZM0-38L-9-26L0-29L9-26ZM0-24L-12-10L0-14L12-10Z" fill="#cdd9f0" opacity=".85"/>' : ''}</g>`;
  const glowWin = (x, y, w, h, o = {}) =>
    `<g class="${o.cls || ''}"><rect x="${x - 3}" y="${y - 3}" width="${w + 6}" height="${h + 6}" rx="3" fill="#ffc861" opacity=".16"/>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5" fill="${o.fill || '#ffd27a'}"/>
      <path d="M${x + w / 2} ${y}v${h}M${x} ${y + h / 2}h${w}" stroke="#3a2412" stroke-width=".9"/></g>`;
  const vignette = (u) => `<defs><radialGradient id="vn${u}" cx=".5" cy=".5" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".62"/></radialGradient></defs><rect width="400" height="240" fill="url(#vn${u})"/>`;

  const SCENES = {
    cover(u) {
      const win = [];
      for (let r = 0; r < 2; r++) for (let c = 0; c < 5; c++) {
        const x = 168 + c * 17, y = 134 + r * 22;
        if (r === 0 && c === 3) win.push(glowWin(x, y, 9, 12, { cls: 'pulse', fill: '#ff9a6a' }));
        else if ((r * 5 + c) % 4 === 2) win.push(`<rect x="${x}" y="${y}" width="9" height="12" fill="#1a2238"/>`);
        else win.push(glowWin(x, y, 9, 12, { cls: (r + c) % 3 === 0 ? 'flick' : '' }));
      }
      return `<defs>
        <linearGradient id="sk${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#060914"/><stop offset=".6" stop-color="#14213d"/><stop offset="1" stop-color="#34476f"/></linearGradient>
        <radialGradient id="mn${u}"><stop offset="0" stop-color="#fff6d8" stop-opacity=".9"/><stop offset=".22" stop-color="#cfd8f5" stop-opacity=".35"/><stop offset="1" stop-color="#cfd8f5" stop-opacity="0"/></radialGradient>
        <linearGradient id="gd${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9e3f6"/><stop offset="1" stop-color="#7f94bb"/></linearGradient></defs>
        <rect width="400" height="240" fill="url(#sk${u})"/>${stars(46, 11)}
        <circle cx="318" cy="48" r="70" fill="url(#mn${u})"/><circle cx="318" cy="48" r="15" fill="#f7f1da"/><circle cx="313" cy="44" r="3" fill="#e2d9b8"/><circle cx="323" cy="53" r="2" fill="#e2d9b8"/>
        <g class="drift" opacity=".5" fill="#4a5c85"><ellipse cx="270" cy="58" rx="46" ry="6"/><ellipse cx="350" cy="40" rx="36" ry="5"/><ellipse cx="60" cy="52" rx="50" ry="6"/></g>
        <path d="M-10 160L40 104L74 132L120 78L168 138L226 92L290 146L340 108L410 160V240H-10Z" fill="#1b2a49"/>
        <path d="M120 78L106 98L118 92L128 102L134 94ZM226 92L212 112L224 106L234 116L240 106ZM40 104L30 118L40 114L48 120ZM340 108L330 122L340 118L350 124Z" fill="#cdd9f0" opacity=".75"/>
        <path d="M-10 190L50 140L100 168L150 130L250 130L300 166L350 134L410 180V240H-10Z" fill="#101a31"/>
        <g>${[20, 44, 70, 96, 108, 292, 312, 336, 362, 386].map((x, i) => pine(x, 176 + (i % 3) * 4, 0.9 + (i % 4) * 0.12)).join('')}</g>
        <ellipse cx="210" cy="190" rx="140" ry="16" fill="#ffc46a" opacity=".1"/>
        <!-- 山庄 -->
        <g fill="#0b1224"><rect x="120" y="148" width="46" height="36"/><rect x="254" y="148" width="46" height="36"/><rect x="160" y="124" width="100" height="62"/><rect x="196" y="82" width="28" height="44"/>
          <path d="M112 150L143 126L174 150Z M246 150L277 126L308 150Z M150 126L210 94L270 126Z M192 84L210 56L228 84Z"/><rect x="236" y="96" width="9" height="22"/></g>
        <path d="M150 126L210 94L270 126L266 126L210 99L154 126Z M192 84L210 56L228 84L224 84L210 62L196 84Z" fill="#dce6f7" opacity=".9"/>
        <path d="M112 150L143 126L174 150L170 150L143 131L116 150Z M246 150L277 126L308 150L304 150L277 131L250 150Z" fill="#dce6f7" opacity=".85"/>
        <g class="smoke" fill="#9fb0cf" opacity=".35"><circle cx="240" cy="90" r="4"/><circle cx="246" cy="78" r="5"/><circle cx="238" cy="64" r="6"/></g>
        ${win.join('')}${glowWin(132, 160, 9, 12)}${glowWin(279, 160, 9, 12, { cls: 'flick' })}${glowWin(203, 100, 14, 12)}
        <path d="M198 186v-18a12 12 0 0 1 24 0v18z" fill="#ffcf78"/><path d="M198 186v-18a12 12 0 0 1 24 0v18z" fill="none" stroke="#3a2412" stroke-width="1.5"/>
        <path d="M0 196C60 186 120 200 200 194C280 188 340 200 400 190V240H0Z" fill="url(#gd${u})"/>
        <ellipse cx="210" cy="203" rx="30" ry="6" fill="#ffd27a" opacity=".35"/>
        <!-- 断桥 -->
        <g><rect x="0" y="206" width="76" height="4" fill="#2a1d14"/><path d="M0 214h72" stroke="#2a1d14" stroke-width="3" stroke-dasharray="12 3"/>
          <path d="M72 206l10 10-4 2-8-8z M60 206l16 6" stroke="#2a1d14" stroke-width="3" fill="none"/>
          <g fill="#3a281a"><rect x="8" y="190" width="4" height="22"/><rect x="40" y="190" width="4" height="22"/></g><path d="M10 194L42 194" stroke="#3a281a" stroke-width="2"/>
          <path d="M80 214V240H110V226Z" fill="#0b1224"/></g>
        <g class="drift2" opacity=".28" fill="#cfdcf3"><ellipse cx="60" cy="226" rx="70" ry="9"/><ellipse cx="320" cy="224" rx="80" ry="10"/></g>
        ${flakes(46, 5)}`;
    },
    study(u) {
      return `<defs><linearGradient id="w${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b2a20"/><stop offset="1" stop-color="#22160f"/></linearGradient>
        <linearGradient id="ns${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0c1428"/><stop offset="1" stop-color="#2a3b60"/></linearGradient>
        <linearGradient id="cone${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd890" stop-opacity=".55"/><stop offset="1" stop-color="#ffd890" stop-opacity="0"/></linearGradient></defs>
        <rect width="400" height="240" fill="url(#w${u})"/><rect y="150" width="400" height="50" fill="#1d120c"/><path d="M0 150h400" stroke="#4a3220" stroke-width="3"/>
        <g stroke="#2e1d13" stroke-width="2">${[40, 120, 200, 280, 360].map((x) => `<rect x="${x}" y="160" width="60" height="30" fill="none"/>`).join('')}</g>
        <path d="M0 196H400V240H0Z" fill="#2a1912"/><path d="M0 214H400M0 228H400" stroke="#1d110b" stroke-width="2"/>
        <path d="M44 204H356L372 238H28Z" fill="#5c1f2c"/><path d="M52 208H348L360 232H40Z" fill="none" stroke="#c99a4a" stroke-width="1.6"/>
        <!-- 书架 -->
        <rect x="8" y="26" width="112" height="168" fill="#1b110c" stroke="#3b2618" stroke-width="3"/>
        ${[0, 1, 2, 3].map((i) => books(12, 32 + i * 40, 104, 34, 20 + i) + `<rect x="10" y="${68 + i * 40}" width="108" height="4" fill="#3b2618"/>`).join('')}
        <!-- 窗 -->
        <rect x="286" y="36" width="84" height="104" fill="url(#ns${u})" stroke="#5a3b24" stroke-width="5"/>
        <g transform="translate(286 36)"><svg width="84" height="104" viewBox="0 0 84 104" overflow="hidden">${flakes(14, 3, 84).replace(/class="fl"/g, 'class="fl" ')}</svg></g>
        <path d="M328 36v104M286 88h84" stroke="#5a3b24" stroke-width="4"/>
        <path d="M278 30h24v114l-24-10z M378 30h-24v114l24-10z" fill="#6a2a35"/><path d="M282 30v110M290 30v106M374 30v110M366 30v106" stroke="#4a1c26" stroke-width="1.5"/>
        <!-- 钟 -->
        <g transform="translate(206 62)"><circle r="19" fill="#eadfc3" stroke="#5a3b24" stroke-width="3"/>
          <g stroke="#2a1d14" stroke-width="1.5">${Array.from({ length: 12 }, (_, i) => `<path transform="rotate(${i * 30})" d="M0-16v3"/>`).join('')}</g>
          <path transform="rotate(355)" d="M0 0V-9" stroke="#1a1410" stroke-width="2.6" stroke-linecap="round"/><path transform="rotate(300)" d="M0 0V-14" stroke="#1a1410" stroke-width="1.8" stroke-linecap="round"/><circle r="1.6" fill="#b22"/></g>
        <!-- 沙发 -->
        <g><rect x="104" y="150" width="124" height="46" rx="12" fill="#6b2531"/><rect x="104" y="166" width="124" height="30" rx="8" fill="#82303d"/><rect x="96" y="158" width="22" height="44" rx="9" fill="#5c1f2b"/><rect x="214" y="158" width="22" height="44" rx="9" fill="#5c1f2b"/>
          <path d="M126 168h80" stroke="#5c1f2b" stroke-width="2"/><circle cx="130" cy="172" r="2" fill="#d4af37"/></g>
        <!-- 书桌 -->
        <g><rect x="232" y="142" width="130" height="10" rx="2" fill="#5b3a24"/><rect x="238" y="152" width="8" height="46" fill="#3e2616"/><rect x="348" y="152" width="8" height="46" fill="#3e2616"/><rect x="246" y="152" width="102" height="14" fill="#47301e"/>
          <path d="M250 142v-2h40v2z" fill="#6b4a30"/>
          <rect x="296" y="136" width="40" height="7" fill="#1a1512" stroke="#6b4a30"/><path d="M308 136v7M320 136v7" stroke="#6b4a30"/><circle cx="302" cy="139.5" r="2" fill="#f4f0e0"/>
          <!-- 台灯 -->
          <ellipse cx="258" cy="141" rx="10" ry="3" fill="#1d3a2c"/><path d="M258 141V116" stroke="#b8923e" stroke-width="2.5"/><path d="M244 118L258 104L274 118Z" fill="#1f6a46"/>
          <path d="M246 118L270 118L296 142H236Z" fill="url(#cone${u})" class="flick2"/></g>
        <!-- 粉笔人形 + 翻倒的杯子 -->
        <g stroke="#f1f1ec" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-dasharray="5 3" opacity=".9"><circle cx="242" cy="214" r="6"/><path d="M247 217C260 214 276 212 292 216M262 214L270 202M266 218L276 226M292 216L304 208M292 217L306 226"/><path d="M247 213L260 205"/></g>
        <path d="M148 220l16-3 2 7-16 3z" fill="#9fb4d0" opacity=".7"/><ellipse cx="172" cy="226" rx="14" ry="4" fill="#3a1520" opacity=".7"/><circle cx="184" cy="222" r="1.6" fill="#ffe9a8"/><circle cx="188" cy="225" r="1.3" fill="#ffe9a8"/>
        <path d="M0 0L40 0L0 40Z" fill="#000" opacity=".18"/>`;
    },
    library(u) {
      const flame = (x, d, h, c) => `<path class="flame" style="animation-delay:${d}s" d="M${x} 184c-14-4-10-20-2-28c0 8 6 10 8 6c4 8 12 10 10 22c-4 4-12 4-16 0z" fill="${c}"/>`;
      return `<defs><linearGradient id="w${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c2420"/><stop offset="1" stop-color="#1a1411"/></linearGradient>
        <radialGradient id="fg${u}" cx=".5" cy=".7" r=".6"><stop offset="0" stop-color="#ff9a3c" stop-opacity=".6"/><stop offset="1" stop-color="#ff9a3c" stop-opacity="0"/></radialGradient></defs>
        <rect width="400" height="240" fill="url(#w${u})"/>
        ${[8, 306].map((x, k) => `<rect x="${x}" y="14" width="86" height="190" fill="#1b110c" stroke="#3b2618" stroke-width="3"/>${[0, 1, 2, 3, 4].map((i) => books(x + 4, 20 + i * 36, 78, 30, 40 + k * 7 + i) + `<rect x="${x + 2}" y="${50 + i * 36}" width="82" height="4" fill="#3b2618"/>`).join('')}`).join('')}
        <path d="M0 204H400V240H0Z" fill="#241712"/><ellipse cx="200" cy="222" rx="170" ry="16" fill="#4a2230"/><ellipse cx="200" cy="222" rx="140" ry="11" fill="none" stroke="#c99a4a" stroke-width="1.2" opacity=".7"/>
        <!-- 壁炉 -->
        <path d="M130 196V92H270V196Z" fill="#4a4540"/><path d="M118 92H282V80H118Z" fill="#5d574f"/><path d="M146 196V114Q200 90 254 114V196Z" fill="#0b0705"/>
        <g stroke="#3a352f" stroke-width="2">${[0, 1, 2, 3, 4].map((i) => `<path d="M130 ${100 + i * 20}h16M254 ${100 + i * 20}h16"/>`).join('')}</g>
        ${flame(176, 0, 0, '#ff7a1c')}${flame(200, .35, 0, '#ffb23c')}${flame(222, .7, 0, '#ff6a1c')}${flame(200, .15, 0, '#ffe08a').replace('d="', 'transform="scale(.6) translate(133 120)" d="')}
        <path d="M160 190h80" stroke="#2a1a10" stroke-width="6" stroke-linecap="round"/>
        <rect x="100" y="0" width="200" height="240" fill="url(#fg${u})" class="flick2"/>
        <g><rect x="150" y="68" width="4" height="12" fill="#efe7d0"/><rect x="246" y="68" width="4" height="12" fill="#efe7d0"/><path class="flame" d="M152 66q-3-6 0-10q3 4 0 10z" fill="#ffd27a"/><path class="flame" style="animation-delay:.4s" d="M248 66q-3-6 0-10q3 4 0 10z" fill="#ffd27a"/>
          <rect x="188" y="52" width="24" height="30" fill="#3b2b1c" stroke="#c99a4a" stroke-width="2"/><circle cx="200" cy="66" r="7" fill="#8a7a5a"/></g>
        <!-- 棋桌 -->
        <g transform="translate(284 168)"><ellipse cx="0" cy="22" rx="34" ry="8" fill="#000" opacity=".3"/><rect x="-3" y="2" width="6" height="22" fill="#3b2616"/><ellipse cx="0" cy="2" rx="36" ry="9" fill="#5b3a24"/>
          ${Array.from({ length: 16 }, (_, i) => { const r = Math.floor(i / 4), c = i % 4; return `<rect x="${-16 + c * 8}" y="${-4 + r * 2.4}" width="8" height="2.4" fill="${(r + c) % 2 ? '#e7dcc0' : '#2a1d14'}"/>`; }).join('')}
          <circle cx="-8" cy="-3" r="2" fill="#f4f0e0"/><circle cx="4" cy="-1" r="2" fill="#1a1512"/><circle cx="9" cy="-4" r="2" fill="#f4f0e0"/>
          <g><rect x="-30" y="-6" width="8" height="6" rx="1" fill="#efe9dc"/><rect x="22" y="-6" width="8" height="6" rx="1" fill="#efe9dc"/></g>
          <path class="steam" d="M-26-8q-3-6 0-10q3-4 0-8" stroke="#fff" stroke-width="1.6" fill="none" opacity=".5"/></g>
        <g fill="#2b1d1f"><path d="M64 214c-4-30 6-48 24-48c18 0 28 18 24 48z"/><path d="M296 214c-2-24 8-40 22-42c14 2 22 16 18 42z" opacity=".0"/></g>
        <path d="M0 0L60 0L0 60Z" fill="#000" opacity=".15"/>`;
    },
    kitchen(u) {
      const tile = `<pattern id="tl${u}" width="20" height="14" patternUnits="userSpaceOnUse"><rect width="20" height="14" fill="#b9c4c1"/><rect x="1" y="1" width="18" height="12" fill="#cdd7d4"/></pattern>`;
      return `<defs>${tile}<radialGradient id="bl${u}" cx=".5" cy=".0" r=".9"><stop offset="0" stop-color="#ffd890" stop-opacity=".6"/><stop offset="1" stop-color="#ffd890" stop-opacity="0"/></radialGradient></defs>
        <rect width="400" height="240" fill="#46505a"/><rect y="20" width="400" height="170" fill="url(#tl${u})" opacity=".92"/><rect y="20" width="400" height="170" fill="#1a2130" opacity=".35"/>
        <path d="M0 190H400V240H0Z" fill="#2a2e35"/><g>${Array.from({ length: 20 }, (_, i) => `<rect x="${(i % 10) * 40}" y="${i < 10 ? 190 : 215}" width="40" height="25" fill="${(i + (i < 10 ? 0 : 1)) % 2 ? '#2d3138' : '#22262c'}"/>`).join('')}</g>
        <!-- 窗 -->
        <rect x="16" y="40" width="74" height="70" fill="#101a30" stroke="#7a6a50" stroke-width="4"/><g transform="translate(16 40)"><svg width="74" height="70" viewBox="0 0 74 70" overflow="hidden">${flakes(10, 9, 74)}</svg></g><path d="M53 40v70M16 75h74" stroke="#7a6a50" stroke-width="3"/>
        <!-- 挂杆 -->
        <path d="M110 46H390" stroke="#9aa0a6" stroke-width="3"/>
        ${[124, 150, 176].map((x, i) => `<g><path d="M${x} 46v${14 + i * 4}" stroke="#9aa0a6" stroke-width="2"/><circle cx="${x}" cy="${72 + i * 4}" r="${9 - i}" fill="#7d838a"/><circle cx="${x}" cy="${72 + i * 4}" r="${5 - i / 2}" fill="#5a5f66"/></g>`).join('')}
        ${[240, 262, 284].map((x, i) => `<g><path d="M${x} 46v14" stroke="#9aa0a6" stroke-width="2"/><ellipse cx="${x}" cy="68" rx="${5 + i}" ry="6" fill="#a8adb3"/></g>`).join('')}
        <g><path d="M318 46v20" stroke="#9aa0a6" stroke-width="2"/><path d="M308 66h22l-3 22h-16z" fill="#c9ced3"/><path d="M340 46v24" stroke="#9aa0a6" stroke-width="2"/><rect x="334" y="70" width="12" height="28" rx="2" fill="#8a9097"/></g>
        <!-- 灶台 -->
        <g><rect x="100" y="132" width="110" height="64" fill="#1c1f24"/><rect x="100" y="126" width="110" height="10" fill="#2b2f36"/><circle cx="130" cy="128" r="8" fill="#101216"/><circle cx="180" cy="128" r="8" fill="#101216"/>
          <g fill="#6aa6ff" class="flick"><path d="M122 128h16l-8-5z M172 128h16l-8-5z"/></g>
          <path d="M112 156h86M112 172h86" stroke="#34383f" stroke-width="2"/><circle cx="120" cy="146" r="3" fill="#888"/><circle cx="150" cy="146" r="3" fill="#888"/><circle cx="180" cy="146" r="3" fill="#888"/>
          <path d="M120 126V104h28v22z" fill="#6c727a"/><rect x="116" y="100" width="36" height="6" rx="3" fill="#868c94"/><path d="M146 112h12" stroke="#868c94" stroke-width="3"/>
          <g class="steam" stroke="#fff" fill="none" stroke-width="2.4" opacity=".55" stroke-linecap="round"><path d="M128 98q-5-8 0-14t0-14"/><path d="M138 98q5-8 0-14t0-14" style="animation-delay:.7s"/></g></g>
        <!-- 台面 -->
        <g><rect x="226" y="140" width="164" height="12" fill="#8a6a44"/><rect x="230" y="152" width="156" height="42" fill="#3d4650"/><path d="M308 152v42" stroke="#2c333b" stroke-width="2"/><circle cx="300" cy="172" r="2" fill="#aaa"/><circle cx="316" cy="172" r="2" fill="#aaa"/>
          <rect x="240" y="132" width="52" height="8" rx="2" fill="#c8a56e"/><path d="M246 132l34-6 3 6z" fill="#cfd4d9"/><rect x="278" y="127" width="14" height="5" fill="#5a3a24"/>
          <circle cx="258" cy="130" r="4" fill="#e07a2a"/><circle cx="268" cy="129" r="3.4" fill="#c9302c" opacity=".0"/>
          <g>${[0, 1, 2, 3, 4].map((i) => `<ellipse cx="342" cy="${137 - i * 3}" rx="${17 - i * .4}" ry="3" fill="${i % 2 ? '#eef0f2' : '#dfe3e6'}" stroke="#aeb4ba" stroke-width=".6"/>`).join('')}</g>
          <path d="M366 140l8-28" stroke="#d9dde0" stroke-width="3"/></g>
        <g>${['#c9552e', '#d4a72c', '#6a8a3a', '#9a4a3a', '#d4a72c'].map((c, i) => `<rect x="${232 + i * 30}" y="94" width="20" height="26" rx="4" fill="${c}" opacity=".9"/><rect x="${230 + i * 30}" y="90" width="24" height="6" rx="2" fill="#4a3a28"/>`).join('')}<rect x="226" y="120" width="160" height="4" fill="#5a4a38"/></g>
        <!-- 吊灯 -->
        <g class="swing" style="transform-origin:200px 0"><path d="M200 0v34" stroke="#222" stroke-width="2"/><path d="M188 48a12 12 0 0 1 24 0z" fill="#2d2f33"/><circle cx="200" cy="50" r="5" fill="#ffe7a8"/></g>
        <rect width="400" height="240" fill="url(#bl${u})"/><path d="M0 0L60 0L0 60Z" fill="#000" opacity=".15"/>`;
    },
    hall(u) {
      const keys = []; for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) {
        const x = 118 + c * 13, y = 92 + r * 18;
        if (r === 1 && c === 3) keys.push(`<circle class="pulse" cx="${x}" cy="${y}" r="6" fill="none" stroke="#ff6a5a" stroke-width="1.6"/><circle cx="${x}" cy="${y}" r="1.4" fill="#444"/>`);
        else keys.push(`<circle cx="${x}" cy="${y}" r="1.4" fill="#444"/><path d="M${x} ${y + 1}v8" stroke="#d4af37" stroke-width="1.4"/><circle cx="${x}" cy="${y + 11}" r="2.2" fill="none" stroke="#d4af37" stroke-width="1.2"/>`);
      }
      const r = rng(77);
      return `<defs><linearGradient id="w${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a3736"/><stop offset="1" stop-color="#18211f"/></linearGradient></defs>
        <rect width="400" height="240" fill="url(#w${u})"/><rect y="140" width="400" height="56" fill="#141b1a"/><path d="M0 140h400" stroke="#4a3b26" stroke-width="3"/>
        <g stroke="#223030" stroke-width="2">${[20, 90, 160, 230, 300].map((x) => `<rect x="${x}" y="150" width="60" height="38" fill="none"/>`).join('')}</g>
        <g>${Array.from({ length: 40 }, (_, i) => { const row = Math.floor(i / 20), c = i % 20; return `<rect x="${c * 20}" y="${196 + row * 22}" width="20" height="22" fill="${(row + c) % 2 ? '#d8d4c8' : '#2a2c30'}" opacity=".85"/>`; }).join('')}</g>
        <rect y="196" width="400" height="44" fill="#000" opacity=".35"/>
        <!-- 吊灯 -->
        <g><path d="M200 0v26" stroke="#777" stroke-width="2"/><path d="M166 40Q200 54 234 40" stroke="#c9a14a" stroke-width="3" fill="none"/><path d="M200 26v20" stroke="#c9a14a" stroke-width="3"/>
          ${[170, 186, 200, 214, 230].map((x, i) => `<rect x="${x - 2}" y="${i % 2 ? 30 : 34}" width="4" height="9" fill="#efe7d0"/><path class="flame" style="animation-delay:${i * .2}s" d="M${x} ${i % 2 ? 29 : 33}q-3-6 0-9q3 3 0 9z" fill="#ffd27a"/>`).join('')}
          <ellipse cx="200" cy="40" rx="110" ry="40" fill="#ffd27a" opacity=".07"/></g>
        <!-- 落地钟 -->
        <g><rect x="22" y="56" width="46" height="146" rx="4" fill="#4a2f1c" stroke="#2e1c10" stroke-width="3"/><path d="M22 56Q45 36 68 56Z" fill="#5a3a24"/>
          <circle cx="45" cy="82" r="15" fill="#eadfc3" stroke="#c9a14a" stroke-width="2.4"/><path d="M45 82v-9M45 82l8 3" stroke="#2a1d14" stroke-width="2" stroke-linecap="round"/>
          <rect x="30" y="108" width="30" height="80" rx="3" fill="#1b110a"/><g class="pend" style="transform-origin:45px 110px"><path d="M45 110v58" stroke="#c9a14a" stroke-width="2"/><circle cx="45" cy="172" r="7" fill="#c9a14a"/></g></g>
        <!-- 钥匙柜 -->
        <g><rect x="104" y="62" width="100" height="84" rx="3" fill="#3a2616" stroke="#5b3a24" stroke-width="4"/><rect x="110" y="68" width="88" height="72" fill="#17110c"/>${keys.join('')}
          <path d="M110 68L198 68L198 140" stroke="#fff" stroke-width="1" opacity=".06" fill="none"/><path d="M104 62L134 62L110 140H104Z" fill="#fff" opacity=".05"/></g>
        <!-- 登记簿桌 -->
        <g><rect x="96" y="172" width="120" height="8" fill="#5b3a24"/><rect x="104" y="180" width="6" height="26" fill="#3e2616"/><rect x="202" y="180" width="6" height="26" fill="#3e2616"/>
          <path d="M122 172l32-10 32 10z" fill="#f2ecd8"/><path d="M154 162v10" stroke="#b9ae92" stroke-width="1.2"/><path d="M130 169l20-6M130 172l20-6M158 164l22 6M158 167l22 5" stroke="#8a8068" stroke-width=".9" opacity=".7"/></g>
        <!-- 失灵监控 -->
        <g><rect x="232" y="68" width="62" height="46" rx="3" fill="#0c0d10" stroke="#3a3d44" stroke-width="3"/><rect x="238" y="74" width="50" height="34" fill="#202428"/>
          <g class="noise">${Array.from({ length: 26 }, () => `<rect x="${(238 + r() * 46).toFixed(0)}" y="${(74 + r() * 32).toFixed(0)}" width="${(3 + r() * 9).toFixed(0)}" height="2" fill="#${r() > .5 ? 'bbb' : '666'}"/>`).join('')}</g>
          <text x="263" y="94" font-size="6.5" fill="#ff5a4a" text-anchor="middle" font-family="monospace" class="flick">NO SIGNAL</text><circle cx="286" cy="70" r="1.4" fill="#ff3a2a" class="flick"/></g>
        <!-- 楼梯 -->
        <g>${Array.from({ length: 7 }, (_, i) => `<path d="M${320 + i * 11} ${200 - i * 18}H400V240H${320 + i * 11}Z" fill="${i % 2 ? '#3a2616' : '#4a3220'}"/><rect x="${320 + i * 11}" y="${200 - i * 18}" width="${80 - i * 11}" height="3" fill="#6b4a30"/>`).join('')}
          <path d="M316 200L400 74" stroke="#c99a4a" stroke-width="3"/>${Array.from({ length: 5 }, (_, i) => `<path d="M${328 + i * 16} ${190 - i * 20}v-26" stroke="#6b4a30" stroke-width="2.4"/>`).join('')}</g>
        <path d="M0 0L60 0L0 60Z" fill="#000" opacity=".18"/>`;
    },
    clinic(u) {
      const bot = (x, y, c, h = 14) => `<rect x="${x}" y="${y - h}" width="9" height="${h}" rx="2" fill="${c}" opacity=".9"/><rect x="${x + 1.5}" y="${y - h - 3}" width="6" height="3.4" fill="#e9eff2"/><rect x="${x + 1.5}" y="${y - h / 2 - 3}" width="6" height="5" fill="#fff" opacity=".8"/>`;
      return `<defs><linearGradient id="w${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f5058"/><stop offset="1" stop-color="#1c3238"/></linearGradient></defs>
        <rect width="400" height="240" fill="url(#w${u})"/><rect y="170" width="400" height="70" fill="#14262b"/><path d="M0 170h400" stroke="#6d8f95" stroke-width="2"/>
        <g stroke="#1c3238" stroke-width="2" opacity=".8">${Array.from({ length: 9 }, (_, i) => `<path d="M${i * 50} 170V240"/>`).join('')}<path d="M0 205H400"/></g>
        <!-- 药柜 -->
        <g><rect x="16" y="34" width="96" height="136" rx="3" fill="#e9eff2" stroke="#b7c6cb" stroke-width="3"/><rect x="22" y="40" width="84" height="124" fill="#cfdde1"/>
          ${[0, 1, 2].map((i) => `<rect x="22" y="${74 + i * 40}" width="84" height="3" fill="#97aab0"/>${bot(28, 74 + i * 40, ['#c9552e', '#2e7ac9', '#6a8a3a'][i])}${bot(44, 74 + i * 40, ['#d4a72c', '#9a4ac9', '#c9302c'][i], 18)}${bot(60, 74 + i * 40, ['#2e9a8a', '#d4a72c', '#2e7ac9'][i], 12)}${bot(76, 74 + i * 40, '#e9eff2', 16)}${bot(92, 74 + i * 40, ['#c9552e', '#6a8a3a', '#9a4ac9'][i], 10)}`).join('')}
          <path d="M22 40L52 40L22 90Z" fill="#fff" opacity=".18"/></g>
        <!-- 红十字 -->
        <g class="pulse"><rect x="170" y="40" width="40" height="40" rx="6" fill="#e9eff2"/><path d="M184 48h12v10h10v12h-10v10h-12V70h-10V58h10z" fill="#c9302c" transform="translate(0 -2) scale(1)"/></g>
        <!-- 监护仪 -->
        <g><rect x="318" y="46" width="68" height="46" rx="4" fill="#0b1214" stroke="#3a5258" stroke-width="3"/><polyline class="ecg" points="322,72 336,72 340,62 346,84 352,56 358,72 382,72" fill="none" stroke="#4aff9a" stroke-width="1.8" stroke-linejoin="round"/><rect x="346" y="92" width="12" height="62" fill="#3a5258"/></g>
        <!-- 诊疗床 -->
        <g><rect x="250" y="148" width="132" height="14" rx="4" fill="#cfdde1"/><rect x="258" y="136" width="116" height="16" rx="6" fill="#f4f7f8"/><rect x="256" y="130" width="36" height="12" rx="6" fill="#fff"/><rect x="262" y="162" width="6" height="30" fill="#7d949a"/><rect x="364" y="162" width="6" height="30" fill="#7d949a"/><path d="M300 136q30 12 70 0" stroke="#b9c9ce" stroke-width="2" fill="none"/></g>
        <!-- 桌 -->
        <g><rect x="120" y="148" width="116" height="9" fill="#8a6a44"/><rect x="126" y="157" width="6" height="40" fill="#5a4630"/><rect x="224" y="157" width="6" height="40" fill="#5a4630"/>
          <path d="M138 148l22-8 22 8z" fill="#f2ecd8"/><path d="M148 146l12-4 12 4" stroke="#aaa" stroke-width="1" fill="none"/>
          <g><rect x="190" y="130" width="12" height="18" rx="3" fill="#c9872e"/><rect x="191.5" y="126" width="9" height="5" fill="#f4f4f4"/><circle class="pulse" cx="196" cy="139" r="13" fill="none" stroke="#ffe08a" stroke-width="1.6"/></g>
          <ellipse cx="214" cy="146" rx="3" ry="1.8" fill="#f4e6b8" transform="rotate(-20 214 146)"/><ellipse cx="220" cy="147" rx="3" ry="1.8" fill="#e9b04a" transform="rotate(14 220 147)"/>
          <path d="M150 140q12-12 24 0" stroke="#4b535d" stroke-width="2.4" fill="none"/><ellipse cx="162" cy="141" rx="4" ry="2" fill="#aab3bc"/>
          <path d="M126 148V120l18-4" stroke="#aaa" stroke-width="2" fill="none"/><path d="M138 112l18 8-8 8z" fill="#e9eff2"/><path d="M142 124l30 18-60 6z" fill="#ffe9a8" opacity=".12" class="flick2"/></g>
        <path d="M0 0L60 0L0 60Z" fill="#000" opacity=".18"/>`;
    },
    guestroom(u) {
      const L = (x) => ({ top: 85 * x / 170, bot: 240 - 100 * x / 170 });
      const door = (xa, xb, side) => {
        const A = L(xa), B = L(xb), f = (p, t) => p.top + (p.bot - p.top) * t;
        const mx = (x) => side === 'L' ? x : 400 - x;
        const dh = f(A, 0.18), dh2 = f(B, 0.18);
        const pts = [[xa, dh], [xb, dh2], [xb, B.bot], [xa, A.bot]].map(([x, y]) => `${mx(x).toFixed(1)},${y.toFixed(1)}`).join(' ');
        const lx = [[xa + (xb - xa) * .12, A.bot - (A.bot - A.top) * .02], [xb - (xb - xa) * .12, B.bot - (B.bot - B.top) * .02]];
        const slit = `<polygon points="${mx(xa + (xb - xa) * .1).toFixed(1)},${(A.bot - 1).toFixed(1)} ${mx(xb - (xb - xa) * .1).toFixed(1)},${(B.bot - 1).toFixed(1)} ${mx(xb - (xb - xa) * .1).toFixed(1)},${(B.bot - 3).toFixed(1)} ${mx(xa + (xb - xa) * .1).toFixed(1)},${(A.bot - 4).toFixed(1)}" fill="#ffd27a"/>`;
        const cx = mx((xa + xb) / 2), cy = f({ top: (A.top + B.top) / 2, bot: (A.bot + B.bot) / 2 }, .3);
        return `<polygon points="${pts}" fill="#3a2418" stroke="#6b4a30" stroke-width="1.6"/>${slit}<rect x="${(cx - 3).toFixed(1)}" y="${cy.toFixed(1)}" width="6" height="4" fill="#d4af37"/>`;
      };
      const doors = [[12, 58], [70, 102], [110, 130], [136, 150]];
      return `<defs><linearGradient id="fl${u}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#241812"/><stop offset="1" stop-color="#4a3322"/></linearGradient>
        <radialGradient id="ew${u}" cx=".5" cy=".5" r=".6"><stop offset="0" stop-color="#dbe8ff" stop-opacity=".9"/><stop offset="1" stop-color="#dbe8ff" stop-opacity="0"/></radialGradient></defs>
        <rect width="400" height="240" fill="#0c0f16"/>
        <polygon points="0,0 400,0 230,85 170,85" fill="#1a1713"/><polygon points="0,240 400,240 230,140 170,140" fill="url(#fl${u})"/>
        <polygon points="0,0 170,85 170,140 0,240" fill="#2c2420"/><polygon points="400,0 230,85 230,140 400,240" fill="#2c2420"/>
        <rect x="170" y="85" width="60" height="55" fill="#a9c2ee"/><rect x="170" y="85" width="60" height="55" fill="url(#ew${u})"/><path d="M200 85v55M170 112h60" stroke="#3a4560" stroke-width="2"/>
        <g transform="translate(170 85)"><svg width="60" height="55" viewBox="0 0 60 55" overflow="hidden">${flakes(9, 4, 60).replace(/r="[\d.]+"/g, (m) => 'r="1"')}</svg></g>
        ${doors.map(([a, b]) => door(a, b, 'L') + door(a, b, 'R')).join('')}
        <polygon points="118,240 282,240 214,140 186,140" fill="#7a1f2c"/><polygon points="132,240 268,240 211,140 189,140" fill="none" stroke="#c99a4a" stroke-width="1.6" opacity=".7"/>
        ${[[50, 70], [96, 94], [127, 106]].map(([x, y]) => `<g class="flick"><circle cx="${x}" cy="${y}" r="16" fill="#ffd27a" opacity=".12"/><circle cx="${x}" cy="${y}" r="3.4" fill="#ffe7a8"/></g><g class="flick"><circle cx="${400 - x}" cy="${y}" r="16" fill="#ffd27a" opacity=".12"/><circle cx="${400 - x}" cy="${y}" r="3.4" fill="#ffe7a8"/></g>`).join('')}
        <path d="M0 0L60 0L0 60Z" fill="#000" opacity=".2"/>`;
    },
    dining(u) {
      const chairs = Array.from({ length: 8 }, (_, i) => `<g fill="#1d1412"><rect x="${40 + i * 44}" y="120" width="30" height="46" rx="6"/><rect x="${44 + i * 44}" y="112" width="22" height="12" rx="4"/></g>`).join('');
      return `<defs><linearGradient id="w${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2420"/><stop offset="1" stop-color="#1f1412"/></linearGradient>
        <radialGradient id="ch${u}" cx=".5" cy=".1" r=".7"><stop offset="0" stop-color="#ffd890" stop-opacity=".5"/><stop offset="1" stop-color="#ffd890" stop-opacity="0"/></radialGradient></defs>
        <rect width="400" height="240" fill="url(#w${u})"/><rect y="150" width="400" height="90" fill="#1a100e"/>
        <path d="M12 20h56v110H12z M332 20h56v110h-56z" fill="#6a2a35" opacity=".9"/><path d="M20 20v110M32 20v110M44 20v110M340 20v110M352 20v110M364 20v110" stroke="#4a1c26" stroke-width="2"/>
        <rect x="80" y="30" width="240" height="84" fill="#0e1428" stroke="#6b4a30" stroke-width="5"/><g transform="translate(80 30)"><svg width="240" height="84" viewBox="0 0 240 84" overflow="hidden">${flakes(22, 8, 240)}</svg></g>
        ${chairs}
        <rect width="400" height="240" fill="url(#ch${u})"/>
        <g><path d="M200 0v22" stroke="#9a8a6a" stroke-width="2"/><path d="M170 36Q200 48 230 36" stroke="#c9a14a" stroke-width="3" fill="none"/>${[176, 188, 200, 212, 224].map((x, i) => `<path class="flame" style="animation-delay:${i * .25}s" d="M${x} ${i % 2 ? 34 : 38}q-3-6 0-10q3 4 0 10z" fill="#ffd27a"/>`).join('')}</g>
        <!-- 长桌 -->
        <path d="M20 168H380L400 190H0Z" fill="#f2ede2"/><rect x="0" y="190" width="400" height="14" fill="#e4ded0"/><path d="M20 168H380" stroke="#fff" stroke-width="2"/>
        <path d="M0 204H400V240H0Z" fill="#241713"/>
        ${[48, 94, 140, 260, 306, 352].map((x) => `<ellipse cx="${x}" cy="178" rx="15" ry="4.4" fill="#fff" stroke="#cfc8b8"/><ellipse cx="${x}" cy="177" rx="8" ry="2.2" fill="#e9e3d4"/>`).join('')}
        ${[70, 118, 282, 330].map((x) => `<g><path d="M${x - 4} 160h8l-2 14h-4z" fill="rgba(230,240,255,.55)"/><path d="M${x} 174v6M${x - 4} 180h8" stroke="#d6dcea" stroke-width="1.2"/>${x === 118 ? '<path d="M118 160h8l-2 14h-4z" fill="#8a1f2e" opacity=".8"/>' : ''}</g>`).join('')}
        <!-- 蛋糕 -->
        <g><ellipse cx="200" cy="180" rx="30" ry="7" fill="#d9d2c0"/><rect x="176" y="160" width="48" height="20" rx="3" fill="#f4e6d0"/><path d="M176 164q6 8 12 0t12 0t12 0t12 0" fill="#fff" stroke="#fff" stroke-width="2"/><ellipse cx="200" cy="160" rx="24" ry="5" fill="#fff4e0"/>
          ${[188, 200, 212].map((x, i) => `<rect x="${x - 1.2}" y="148" width="2.4" height="12" fill="#e66"/><path class="flame" style="animation-delay:${i * .3}s" d="M${x} 147q-3-5 0-9q3 4 0 9z" fill="#ffd27a"/>`).join('')}</g>
        <g>${[84, 316].map((x) => `<rect x="${x - 2}" y="150" width="4" height="22" fill="#efe7d0"/><path class="flame" d="M${x} 149q-4-8 0-13q4 5 0 13z" fill="#ffd27a"/><circle cx="${x}" cy="146" r="14" fill="#ffd27a" opacity=".12"/>`).join('')}</g>
        <path d="M0 0L60 0L0 60Z" fill="#000" opacity=".18"/>`;
    }
  };

  // ---------------------------------------------------------------- 新增场景（邮轮 / 戏院 / 科考站 / 老宅）
  const rain = (n, seed, w = 400) => {
    const r = rng(seed);
    return `<g stroke="#bcd0f0" stroke-width=".9" opacity=".5">${Array.from({ length: n }, () => { const x = (r() * (w + 60)).toFixed(0); return `<path class="rn" d="M${x} -10l-6 14" style="animation-duration:${(0.7 + r() * 0.6).toFixed(2)}s;animation-delay:-${(r() * 1.5).toFixed(2)}s"/>`; }).join('')}</g>`;
  };
  const winRow = (x0, y, n, gap, seed, w = 6, h = 7) => {
    const r = rng(seed);
    return Array.from({ length: n }, (_, i) => `<rect x="${x0 + i * gap}" y="${y}" width="${w}" height="${h}" fill="${r() > .22 ? '#ffd27a' : '#1a2238'}" ${r() > .8 ? 'class="flick"' : ''}/>`).join('');
  };
  const fog = (y, o = .3) => `<g class="drift" opacity="${o}" fill="#cfd8e8"><ellipse cx="80" cy="${y}" rx="120" ry="12"/><ellipse cx="300" cy="${y + 8}" rx="130" ry="14"/></g>`;
  Object.assign(SCENES, {
    coverShip(u) {
      return `<defs><linearGradient id="sk${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#070b16"/><stop offset=".6" stop-color="#1a2a46"/><stop offset="1" stop-color="#3a5070"/></linearGradient>
        <linearGradient id="sa${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2c48"/><stop offset="1" stop-color="#060a14"/></linearGradient>
        <radialGradient id="mn${u}"><stop offset="0" stop-color="#fff6d8" stop-opacity=".8"/><stop offset="1" stop-color="#cfd8f5" stop-opacity="0"/></radialGradient></defs>
        <rect width="400" height="240" fill="url(#sk${u})"/>${stars(30, 21)}<circle cx="86" cy="50" r="56" fill="url(#mn${u})"/><circle cx="86" cy="50" r="13" fill="#f4eed6"/>
        <rect y="150" width="400" height="90" fill="url(#sa${u})"/>
        <g stroke="#6d86ad" stroke-width="1" opacity=".5" fill="none" class="drift2"><path d="M0 165q20-4 40 0t40 0t40 0t40 0t40 0t40 0t40 0t40 0t40 0t40 0"/><path d="M0 185q20 4 40 0t40 0t40 0t40 0t40 0t40 0t40 0t40 0t40 0t40 0"/><path d="M0 210q20-4 40 0t40 0t40 0t40 0t40 0t40 0t40 0t40 0t40 0t40 0"/></g>
        <!-- 邮轮 -->
        <g><path d="M40 156H356L336 184H70Z" fill="#0a0f1c"/><path d="M70 178H336L334 184H72Z" fill="#8c1f2a"/>
          <rect x="82" y="138" width="248" height="18" fill="#e9edf5"/><rect x="100" y="122" width="200" height="16" fill="#dfe5ef"/><rect x="130" y="106" width="130" height="16" fill="#d5dce8"/>
          ${winRow(88, 143, 31, 7.8, 3)}${winRow(106, 127, 24, 8.2, 4)}${winRow(136, 111, 15, 8.4, 5)}
          <rect x="170" y="80" width="26" height="28" fill="#c9302c"/><rect x="170" y="80" width="26" height="6" fill="#111"/><rect x="214" y="86" width="22" height="22" fill="#c9302c"/><rect x="214" y="86" width="22" height="5" fill="#111"/>
          <path d="M150 106V70M150 70L134 78" stroke="#cfd5e0" stroke-width="2"/><circle cx="150" cy="68" r="2" fill="#ff4a3a" class="pulse"/>
          <g class="smoke" fill="#9fb0cf" opacity=".35"><circle cx="184" cy="72" r="5"/><circle cx="192" cy="60" r="6"/><circle cx="200" cy="46" r="7"/></g></g>
        <g class="flick" opacity=".35" stroke="#ffd27a" stroke-width="1.6"><path d="M100 188v18M140 188v26M180 188v20M230 188v28M270 188v22M310 188v16"/></g>
        ${fog(168, .35)}${fog(205, .25)}`;
    },
    deck(u) {
      return `<defs><linearGradient id="sk${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a1020"/><stop offset="1" stop-color="#3a4d6c"/></linearGradient>
        <linearGradient id="fl${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b2c20"/><stop offset="1" stop-color="#1a120c"/></linearGradient>
        <radialGradient id="lg${u}"><stop offset="0" stop-color="#ffd890" stop-opacity=".6"/><stop offset="1" stop-color="#ffd890" stop-opacity="0"/></radialGradient></defs>
        <rect width="400" height="240" fill="url(#sk${u})"/>${stars(18, 9)}
        <rect y="112" width="400" height="48" fill="#1a2a44"/><g stroke="#6d86ad" opacity=".4" fill="none" class="drift2"><path d="M0 124q20-4 40 0t40 0t40 0t40 0t40 0t40 0t40 0t40 0t40 0t40 0"/><path d="M0 140q20 4 40 0t40 0t40 0t40 0t40 0t40 0t40 0t40 0t40 0t40 0"/></g>
        <!-- 烟囱 -->
        <g><path d="M250 112V30h50v82z" fill="#b82c28"/><rect x="250" y="30" width="50" height="10" fill="#111"/><rect x="250" y="62" width="50" height="6" fill="#e9e9e9"/><path d="M276 28q-6-12 0-22" stroke="#9fb0cf" stroke-width="6" opacity=".25" fill="none" class="steam"/></g>
        <!-- 救生艇 -->
        <g><path d="M60 100Q110 124 170 100L160 112Q110 128 70 112Z" fill="#e9ecf2"/><path d="M60 100Q110 124 170 100" stroke="#c9302c" stroke-width="3" fill="none"/><path d="M80 96V70M150 96V70M70 70H160" stroke="#8a8f99" stroke-width="3"/></g>
        <!-- 甲板 -->
        <path d="M0 160H400V240H0Z" fill="url(#fl${u})"/>${Array.from({ length: 9 }, (_, i) => `<path d="M0 ${164 + i * 9}H400" stroke="#120c08" stroke-width="1.6"/>`).join('')}
        <path d="M0 160H400" stroke="#6b4a30" stroke-width="3"/>
        <!-- 栏杆 -->
        <g stroke="#cfd5e0" stroke-width="3"><path d="M0 124H400M0 142H400"/>${Array.from({ length: 12 }, (_, i) => `<path d="M${10 + i * 36} 118V162" stroke-width="4"/>`).join('')}</g>
        <!-- 救生圈 -->
        <g transform="translate(330 150)"><circle r="14" fill="#fff"/><circle r="14" fill="none" stroke="#c9302c" stroke-width="5" stroke-dasharray="11 11"/><circle r="6" fill="#1a2a44"/></g>
        <!-- 灯 -->
        <g class="flick"><path d="M200 120V60" stroke="#444" stroke-width="3"/><circle cx="200" cy="58" r="40" fill="url(#lg${u})"/><circle cx="200" cy="58" r="5" fill="#ffe7a8"/></g>
        <!-- 躺椅 -->
        <g fill="#7a5a3a"><path d="M40 210l50-18 8 10-52 20z"/><path d="M40 210l-4 18M92 198l4 18" stroke="#4a3624" stroke-width="3"/></g>
        ${fog(150, .4)}${fog(196, .3)}`;
    },
    cabin(u) {
      return `<defs><linearGradient id="w${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a3626"/><stop offset="1" stop-color="#2a1d14"/></linearGradient>
        <radialGradient id="lg${u}" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffd890" stop-opacity=".5"/><stop offset="1" stop-color="#ffd890" stop-opacity="0"/></radialGradient></defs>
        <rect width="400" height="240" fill="url(#w${u})"/>${Array.from({ length: 8 }, (_, i) => `<path d="M${i * 52} 0V180" stroke="#2a1c12" stroke-width="2" opacity=".6"/>`).join('')}
        <rect y="180" width="400" height="60" fill="#3c1822"/><path d="M0 180H400" stroke="#c99a4a" stroke-width="3"/>
        <!-- 舷窗 -->
        <g><circle cx="318" cy="76" r="34" fill="#b8924a"/><circle cx="318" cy="76" r="28" fill="#1a2a44"/><g clip-path="none"><path d="M290 80q14-6 28 0t28 0M290 96q14 6 28 0t28 0" stroke="#6d86ad" stroke-width="1.6" fill="none" class="drift2"/></g><ellipse cx="318" cy="76" rx="28" ry="28" fill="#cfd8e8" opacity=".25" class="drift"/><path d="M290 76h56M318 48v56" stroke="#b8924a" stroke-width="3"/></g>
        <!-- 床 -->
        <g><rect x="40" y="132" width="170" height="56" rx="6" fill="#5a1f2c"/><rect x="40" y="122" width="170" height="14" rx="6" fill="#efe8dc"/><rect x="48" y="112" width="52" height="16" rx="7" fill="#f4efe6"/><rect x="32" y="104" width="12" height="90" rx="3" fill="#3a2616"/><path d="M60 150h140" stroke="#7a2a38" stroke-width="3"/></g>
        <!-- 床头柜+灯+杯 -->
        <g><rect x="216" y="150" width="40" height="40" fill="#4a3020" stroke="#2a1c12"/><circle cx="236" cy="168" r="2" fill="#d4af37"/><path d="M226 150h20l4-18h-28z" fill="#e8c878"/><circle cx="236" cy="132" r="30" fill="url(#lg${u})" class="flick2"/><path d="M262 150v-8a5 5 0 0 1 10 0v8z" fill="rgba(230,240,255,.5)"/></g>
        <!-- 墙上保险柜（敞开） -->
        <g><rect x="130" y="40" width="46" height="44" fill="#3a3d44" stroke="#1d1f24" stroke-width="3"/><path d="M130 40L112 34V86L130 84Z" fill="#4a4e57"/><rect x="138" y="48" width="30" height="28" fill="#0e0f12"/><circle cx="116" cy="60" r="4" fill="#c9a14a"/></g>
        <!-- 皮箱 -->
        <g><rect x="270" y="190" width="70" height="30" rx="4" fill="#6b4a30"/><path d="M270 204h70" stroke="#3a281a" stroke-width="2"/><rect x="300" y="200" width="10" height="8" fill="#d4af37"/><path d="M276 190V182h58v8" stroke="#3a281a" stroke-width="3" fill="none"/></g>
        <!-- 门（锁链） -->
        <g><rect x="0" y="0" width="22" height="240" fill="#2a1c12"/><path d="M22 60v110" stroke="#c9a14a" stroke-width="3"/><circle cx="22" cy="115" r="5" fill="none" stroke="#c9a14a" stroke-width="2"/></g>
        <path d="M0 0L60 0L0 60Z" fill="#000" opacity=".2"/>`;
    },
    engine(u) {
      return `<defs><linearGradient id="w${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a1c20"/><stop offset="1" stop-color="#0c0d10"/></linearGradient><radialGradient id="hg${u}" cx=".5" cy=".7" r=".6"><stop offset="0" stop-color="#ff7a2a" stop-opacity=".55"/><stop offset="1" stop-color="#ff7a2a" stop-opacity="0"/></radialGradient></defs>
        <rect width="400" height="240" fill="url(#w${u})"/>
        <g stroke="#2b2e35" stroke-width="10" fill="none"><path d="M0 40H400M0 70H300M60 0V60M200 0V40"/></g><g stroke="#4a4e57" stroke-width="3" fill="none"><path d="M0 36H400M0 66H300"/></g>
        <!-- 活塞机组 -->
        ${[0, 1, 2, 3].map((i) => `<g transform="translate(${70 + i * 66} 70)"><rect x="-18" y="0" width="36" height="84" rx="4" fill="#3a3f48" stroke="#1c1e23" stroke-width="3"/><rect x="-7" y="-26" width="14" height="30" fill="#aab1bc"/><g style="animation:piston ${(1.2 + i * 0.1).toFixed(1)}s ease-in-out infinite alternate"><rect x="-10" y="6" width="20" height="14" fill="#c9ced6"/></g><circle cx="0" cy="62" r="9" fill="#2a2d33" stroke="#6a6f78" stroke-width="2"/></g>`).join('')}
        <!-- 仪表 -->
        ${[[330, 70], [366, 70], [330, 106], [366, 106]].map(([x, y], i) => `<g transform="translate(${x} ${y})"><circle r="15" fill="#e9e5d8" stroke="#555" stroke-width="3"/><g style="transform-origin:0 0;animation:swing ${(2 + i * .4).toFixed(1)}s ease-in-out infinite alternate"><path d="M0 0L0-11" stroke="#c9302c" stroke-width="2"/></g><circle r="2" fill="#222"/></g>`).join('')}
        <!-- 钢格栅走道 -->
        <path d="M0 170H400V240H0Z" fill="#14161a"/>${Array.from({ length: 20 }, (_, i) => `<path d="M${i * 20} 170V240" stroke="#2a2d33" stroke-width="2"/>`).join('')}${Array.from({ length: 6 }, (_, i) => `<path d="M0 ${176 + i * 12}H400" stroke="#2a2d33" stroke-width="1.5"/>`).join('')}
        <g fill="none" stroke="#7a2a22" stroke-width="3"><circle cx="40" cy="150" r="12"/><path d="M40 138v24M28 150h24"/></g>
        <g><rect x="296" y="150" width="30" height="40" rx="6" fill="#1f4a7a"/><rect x="332" y="156" width="26" height="34" rx="6" fill="#7a2a22"/></g>
        <g class="steam" stroke="#fff" stroke-width="5" opacity=".3" fill="none" stroke-linecap="round"><path d="M250 160q-8-20 0-36"/></g>
        <rect width="400" height="240" fill="url(#hg${u})" class="flick2"/><path d="M0 0L60 0L0 60Z" fill="#000" opacity=".25"/>`;
    },
    coverTheater(u) {
      return `<defs><linearGradient id="sk${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#120a10"/><stop offset="1" stop-color="#3a1c20"/></linearGradient>
        <linearGradient id="st${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1618"/><stop offset="1" stop-color="#0c0608"/></linearGradient></defs>
        <rect width="400" height="240" fill="url(#sk${u})"/>
        <!-- 戏院外立面 -->
        <path d="M70 200V80L200 40L330 80V200Z" fill="#241214" stroke="#4a2428" stroke-width="3"/><path d="M60 84L200 36L340 84" stroke="#6b3a30" stroke-width="6" fill="none"/>
        <g fill="#c9a14a"><circle cx="200" cy="64" r="12"/></g><path d="M194 64h12M200 58v12" stroke="#241214" stroke-width="2"/>
        ${[84, 116, 286, 318].map((x) => `<rect x="${x}" y="96" width="28" height="48" rx="14" fill="#ffcf78" opacity=".85" class="flick"/><path d="M${x + 14} 96v48M${x} 120h28" stroke="#241214" stroke-width="2"/>`).join('')}
        <!-- 门楣招牌 -->
        <rect x="150" y="100" width="100" height="30" fill="#7a1f1f" stroke="#c9a14a" stroke-width="3"/><text x="200" y="122" text-anchor="middle" font-size="20" font-weight="700" fill="#ffe7a8" letter-spacing="4" font-family="'Noto Serif SC','Songti SC','SimSun',serif" class="flick2">明月戏院</text>
        <path d="M170 200v-34a30 30 0 0 1 60 0v34z" fill="#0e0809"/><path d="M170 200v-34a30 30 0 0 1 60 0v34z" fill="none" stroke="#c9a14a" stroke-width="2"/>
        <!-- 灯笼 -->
        ${[86, 314].map((x) => `<g class="swing" style="transform-origin:${x}px 140px"><path d="M${x} 140v10" stroke="#222"/><ellipse cx="${x}" cy="164" rx="14" ry="17" fill="#c9302c"/><path d="M${x - 10} 164h20" stroke="#7a1a1a"/><circle cx="${x}" cy="164" r="26" fill="#ff6a3a" opacity=".16"/></g>`).join('')}
        <!-- 湿路面 -->
        <path d="M0 200H400V240H0Z" fill="url(#st${u})"/><g class="flick" opacity=".4" stroke="#ffcf78" stroke-width="3"><path d="M110 204v32M164 206v28M200 204v34M236 206v28M290 204v32"/></g>
        <g><path d="M30 210V120" stroke="#222" stroke-width="4"/><circle cx="30" cy="116" r="22" fill="#ffd890" opacity=".14"/><rect x="24" y="108" width="12" height="14" rx="3" fill="#ffe7a8"/></g>
        <g fill="#0a0506"><path d="M330 214l22-2 4-26-24 4z"/><circle cx="336" cy="218" r="8"/><circle cx="360" cy="216" r="8"/><path d="M352 188l10-18" stroke="#0a0506" stroke-width="4"/></g>
        ${rain(70, 17)}`;
    },
    stage(u) {
      return `<defs><linearGradient id="bk${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1f3a"/><stop offset="1" stop-color="#4a3050"/></linearGradient>
        <linearGradient id="sp${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1c4" stop-opacity=".7"/><stop offset="1" stop-color="#fff1c4" stop-opacity=".05"/></linearGradient></defs>
        <rect width="400" height="240" fill="#0a0507"/>
        <!-- 背景画布 -->
        <rect x="50" y="30" width="300" height="120" fill="url(#bk${u})"/><circle cx="270" cy="70" r="26" fill="#f2e9c8" opacity=".9"/><path d="M50 130Q120 90 200 118T350 110V150H50Z" fill="#1a1230" opacity=".8"/><path d="M90 130V96l16-10 16 10v34z" fill="#3a2440"/><path d="M82 98h48l-24-18z" fill="#6a2a30"/>
        <!-- 地板 -->
        <path d="M30 150H370L400 200H0Z" fill="#3a2418"/>${Array.from({ length: 8 }, (_, i) => `<path d="M${30 - i * 4 + i * 0} 150L${i * 57 - 6} 200" stroke="#241408" stroke-width="1.4" opacity=".7"/>`).join('')}
        <!-- 道具：桌与酒杯 -->
        <g><rect x="160" y="150" width="80" height="8" fill="#6b1f1f"/><rect x="170" y="158" width="6" height="22" fill="#4a1414"/><rect x="224" y="158" width="6" height="22" fill="#4a1414"/><path d="M192 150l-3-12h14l-3 12z" fill="#d4af37"/><path d="M212 150l-2-8h10l-2 8z" fill="#c9a14a"/><ellipse cx="238" cy="190" rx="14" ry="3" fill="#6a1020" opacity=".8"/><path d="M258 188l10-3 2 5-10 3z" fill="#d4af37"/></g>
        <!-- 追光 -->
        <path d="M170 0L230 0L290 190H110Z" fill="url(#sp${u})" class="flick2"/>
        <g fill="#fff1c4" opacity=".8">${Array.from({ length: 16 }, (_, i) => `<circle class="fl" cx="${130 + (i * 37) % 140}" cy="0" r="1" style="animation-duration:${8 + (i % 5)}s;animation-delay:-${i}s"/>`).join('')}</g>
        <!-- 红幕 -->
        <path d="M0 0H62Q40 90 56 200H0Z M400 0H338Q360 90 344 200H400Z" fill="#7a1420"/><path d="M14 0Q4 100 16 200M30 0Q18 100 30 200M46 0Q36 100 44 200M386 0Q396 100 384 200M370 0Q382 100 370 200M354 0Q364 100 356 200" stroke="#4a0c14" stroke-width="3" fill="none"/>
        <path d="M0 0H400V26Q200 40 0 26Z" fill="#8a1a28"/><path d="M0 26Q200 40 400 26" stroke="#c9a14a" stroke-width="3" fill="none"/>
        <!-- 观众席剪影 -->
        <path d="M0 240V212Q50 200 100 214T200 210T300 214T400 206V240Z" fill="#050203"/>${Array.from({ length: 14 }, (_, i) => `<rect x="${i * 30 + 6}" y="${214 + (i % 3) * 3}" width="22" height="26" rx="8" fill="#12090b"/>`).join('')}`;
    },
    backstage(u) {
      return `<defs><linearGradient id="w${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2024"/><stop offset="1" stop-color="#1c1012"/></linearGradient></defs>
        <rect width="400" height="240" fill="url(#w${u})"/><rect y="190" width="400" height="50" fill="#2a1814"/>
        <!-- 灯泡镜 -->
        <g><rect x="120" y="36" width="160" height="104" rx="6" fill="#cfd8e0" opacity=".75" stroke="#7a5a3a" stroke-width="6"/><path d="M130 130L200 50M190 136L270 56" stroke="#fff" stroke-width="3" opacity=".25"/>
          ${Array.from({ length: 12 }, (_, i) => `<circle class="flick2" style="animation-delay:-${(i * .3).toFixed(1)}s" cx="${128 + i * 13.8}" cy="32" r="4.2" fill="#ffe7a8"/>`).join('')}
          ${Array.from({ length: 6 }, (_, i) => `<circle class="flick2" style="animation-delay:-${(i * .4).toFixed(1)}s" cx="116" cy="${46 + i * 18}" r="4.2" fill="#ffe7a8"/><circle class="flick2" cx="284" cy="${46 + i * 18}" r="4.2" fill="#ffe7a8"/>`).join('')}</g>
        <!-- 妆台 -->
        <g><rect x="100" y="146" width="200" height="12" fill="#6b4a30"/><rect x="110" y="158" width="8" height="40" fill="#4a3220"/><rect x="282" y="158" width="8" height="40" fill="#4a3220"/>
          ${['#c9302c', '#e9e5d8', '#2e6ac9', '#d4a72c', '#6a8a3a'].map((c, i) => `<rect x="${126 + i * 16}" y="132" width="10" height="14" rx="3" fill="${c}"/>`).join('')}
          <path d="M214 146l24-26M222 146l24-22" stroke="#d9c9a3" stroke-width="2.4"/><circle cx="240" cy="120" r="4" fill="#c9302c"/><circle cx="248" cy="124" r="4" fill="#222"/>
          <rect x="262" y="136" width="26" height="10" fill="#e9e5d8"/></g>
        <!-- 衣架与戏服 -->
        <g><path d="M10 44H88" stroke="#8a8f99" stroke-width="4"/><path d="M14 44V200M84 44V200" stroke="#8a8f99" stroke-width="4"/>
          <path d="M22 50h28l8 120H18z" fill="#a8202a"/><path d="M26 70h20M24 100h26" stroke="#d4af37" stroke-width="2.4"/><path d="M52 50h28l4 110H52z" fill="#1f5a8a"/><path d="M56 80h22M56 110h22" stroke="#d4af37" stroke-width="2.4"/></g>
        <!-- 脸谱 / 头套 -->
        <g><circle cx="336" cy="70" r="18" fill="#f2ecd8"/><path d="M324 64q6-8 12 0M336 64q6-8 12 0M326 80q10 8 20 0" stroke="#c9302c" stroke-width="3" fill="none"/><circle cx="336" cy="70" r="18" fill="none" stroke="#222" stroke-width="2"/>
          <circle cx="368" cy="96" r="14" fill="#1a1a1e"/><path d="M358 92q10-8 20 0" stroke="#d4af37" stroke-width="3" fill="none"/>
          <g><ellipse cx="344" cy="168" rx="18" ry="22" fill="#e6c9ab"/><path d="M326 164q18-30 36 0v12q-18 8-36 0z" fill="#1a1215"/><rect x="340" y="188" width="8" height="30" fill="#7a5a3a"/></g></g>
        <path d="M0 0L60 0L0 60Z" fill="#000" opacity=".2"/>`;
    },
    cellar(u) {
      return `<defs><radialGradient id="lg${u}" cx=".5" cy=".4" r=".6"><stop offset="0" stop-color="#ffb860" stop-opacity=".5"/><stop offset="1" stop-color="#ffb860" stop-opacity="0"/></radialGradient></defs>
        <rect width="400" height="240" fill="#14161a"/>
        <!-- 石拱 -->
        <g fill="#262a30" stroke="#0c0d10" stroke-width="2">${[0, 1, 2, 3, 4].map((i) => `<path d="M${i * 84 - 20} 200V90Q${i * 84 + 22} 30 ${i * 84 + 64} 90V200H${i * 84 + 40}V96Q${i * 84 + 22} 56 ${i * 84 + 4}  96V200Z"/>`).join('')}</g>
        <rect y="30" width="400" height="170" fill="none"/><g stroke="#2e333a" stroke-width="2">${Array.from({ length: 8 }, (_, i) => `<path d="M0 ${36 + i * 22}H400"/>`).join('')}</g>
        <!-- 酒架 -->
        <g><rect x="20" y="84" width="130" height="110" fill="#1e1612" stroke="#3a281a" stroke-width="3"/>${Array.from({ length: 4 }, (_, r) => Array.from({ length: 7 }, (_, c) => `<circle cx="${34 + c * 18}" cy="${100 + r * 26}" r="7" fill="${['#2a3a2a', '#3a2a1a', '#1a2a3a'][(r + c) % 3]}" stroke="#0a0806"/>`).join('')).join('')}</g>
        <!-- 酒桶 -->
        ${[[200, 160], [250, 170], [300, 160]].map(([x, y]) => `<g><ellipse cx="${x}" cy="${y}" rx="28" ry="32" fill="#5a3a20"/><path d="M${x - 28} ${y - 14}Q${x} ${y - 6} ${x + 28} ${y - 14}M${x - 28} ${y + 14}Q${x} ${y + 22} ${x + 28} ${y + 14}" stroke="#2a1a0c" stroke-width="4" fill="none"/><circle cx="${x}" cy="${y}" r="5" fill="#2a1a0c"/></g>`).join('')}
        <!-- 铁门 -->
        <g><rect x="340" y="90" width="50" height="110" rx="24" fill="#2a2d33" stroke="#0e0f12" stroke-width="3"/><path d="M355 100V200M372 100V200" stroke="#0e0f12" stroke-width="3"/><circle cx="378" cy="150" r="4" fill="#c9a14a"/></g>
        <path d="M0 200H400V240H0Z" fill="#1a1c20"/><path d="M0 214H400M0 228H400" stroke="#0e0f12" stroke-width="2"/>
        <!-- 提灯 -->
        <g class="swing" style="transform-origin:200px 20px"><path d="M200 20v34" stroke="#555" stroke-width="2"/><rect x="190" y="54" width="20" height="26" rx="3" fill="#2a2018" stroke="#8a6a3a" stroke-width="2"/><rect x="194" y="58" width="12" height="18" fill="#ffd27a" class="flick"/><circle cx="200" cy="66" r="70" fill="url(#lg${u})"/></g>
        <g stroke="#9aa6bb" stroke-width="1" opacity=".5" fill="none"><path d="M0 0Q30 30 50 0M0 0Q10 40 0 56"/></g>
        <path d="M0 0L70 0L0 70Z" fill="#000" opacity=".3"/>`;
    },
    coverStation(u) {
      return `<defs><linearGradient id="sk${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#03060f"/><stop offset="1" stop-color="#10223a"/></linearGradient>
        <linearGradient id="au${u}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2aff9a" stop-opacity="0"/><stop offset=".3" stop-color="#2aff9a" stop-opacity=".7"/><stop offset=".6" stop-color="#4a9aff" stop-opacity=".6"/><stop offset="1" stop-color="#a04aff" stop-opacity="0"/></linearGradient>
        <linearGradient id="gd${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe0f8"/><stop offset="1" stop-color="#6a86b0"/></linearGradient></defs>
        <rect width="400" height="240" fill="url(#sk${u})"/>${stars(60, 31)}
        <g class="aurora" fill="url(#au${u})"><path d="M-20 90Q80 20 180 70T420 40V100Q300 80 200 110T-20 120Z" opacity=".7"/><path d="M-20 110Q100 60 200 100T420 80V120Q300 110 200 130T-20 140Z" opacity=".45"/></g>
        <path d="M0 160L60 140L130 156L210 134L300 152L360 138L400 150V240H0Z" fill="#17263e"/>
        <path d="M0 176Q100 164 200 178T400 170V240H0Z" fill="url(#gd${u})"/>
        <!-- 科考站 -->
        <g><g stroke="#2a323e" stroke-width="3"><path d="M120 196V210M160 196V210M236 196V210M276 196V210"/></g>
          <rect x="108" y="170" width="68" height="26" rx="6" fill="#c9302c"/><rect x="224" y="170" width="64" height="26" rx="6" fill="#d8dde6"/><rect x="176" y="176" width="48" height="14" fill="#8a929e"/>
          ${winRow(116, 178, 7, 9, 7, 6, 8)}${winRow(232, 178, 6, 9, 8, 6, 8)}
          <path d="M200 176V90M200 90L186 160M200 90L214 160" stroke="#cfd5e0" stroke-width="2"/><circle cx="200" cy="88" r="3" fill="#ff3a2a" class="pulse"/><path d="M190 110h20M192 128h16" stroke="#cfd5e0" stroke-width="2"/>
          <ellipse cx="258" cy="164" rx="12" ry="8" fill="#e9edf5"/></g>
        <!-- 雪地车 -->
        <g fill="#0e1626"><rect x="40" y="206" width="40" height="14" rx="4"/><path d="M44 206l8-12h20l4 12z"/><rect x="36" y="220" width="48" height="4" rx="2"/></g>
        <g class="drift" fill="#fff" opacity=".18"><ellipse cx="100" cy="214" rx="120" ry="8"/><ellipse cx="330" cy="224" rx="100" ry="8"/></g>
        ${flakes(40, 6)}`;
    },
    lab(u) {
      return `<defs><linearGradient id="w${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#26343c"/><stop offset="1" stop-color="#141c20"/></linearGradient></defs>
        <rect width="400" height="240" fill="url(#w${u})"/><rect y="186" width="400" height="54" fill="#10161a"/><path d="M0 186H400" stroke="#4a5e68" stroke-width="3"/>
        <rect x="150" y="0" width="100" height="8" fill="#e6f2ff" class="flick"/><path d="M150 8L110 120M250 8L290 120" stroke="#cfe6ff" stroke-width="1" opacity=".08"/>
        <!-- 白板 -->
        <g><rect x="20" y="30" width="120" height="76" fill="#eef2f4" stroke="#8a929e" stroke-width="4"/><path d="M30 48l20 10 20-16 20 20 20-12M30 70h80M30 84h60" stroke="#2e6ac9" stroke-width="2" fill="none"/><path d="M96 90l12-8" stroke="#c9302c" stroke-width="2.4"/></g>
        <!-- 屏幕 -->
        <g><rect x="170" y="40" width="92" height="56" rx="3" fill="#07100f" stroke="#3a4a52" stroke-width="3"/><polyline class="ecg" points="176,80 190,80 196,60 204,92 212,52 220,80 256,80" fill="none" stroke="#4aff9a" stroke-width="1.8"/><path d="M176 50h30M176 58h18" stroke="#2a8a5a" stroke-width="2"/></g>
        <g><rect x="276" y="40" width="64" height="56" rx="3" fill="#07101a" stroke="#3a4a52" stroke-width="3"/><path d="M284 86l12-18 12 8 12-22 12 10 8-14" stroke="#4aa0ff" stroke-width="2" fill="none"/></g>
        <!-- 工作台 -->
        <g><rect x="30" y="150" width="340" height="14" fill="#7a8890"/><rect x="40" y="164" width="320" height="30" fill="#2a3a42"/><path d="M130 164v30M230 164v30M300 164v30" stroke="#1a262c" stroke-width="2"/>
          <!-- 烧瓶 -->
          <path d="M60 150l4-26h12l4 26z" fill="rgba(180,230,255,.35)" stroke="#9fc4d8"/><path d="M62 146h16l2 4H60z" fill="#4aff9a" opacity=".7"/><circle class="steam" cx="70" cy="120" r="0"/><g class="steam" stroke="#fff" fill="none" stroke-width="2" opacity=".5"><path d="M70 120q-4-8 0-14"/></g>
          <circle cx="110" cy="136" r="14" fill="rgba(180,230,255,.3)" stroke="#9fc4d8" stroke-width="2"/><path d="M110 122v-10M104 112h12" stroke="#9fc4d8" stroke-width="2.4"/><circle cx="110" cy="140" r="10" fill="#ff7a4a" opacity=".5" class="flick2"/>
          <!-- 显微镜 -->
          <g><rect x="170" y="146" width="30" height="4" fill="#222"/><path d="M180 146V120l16-16" stroke="#3a3f48" stroke-width="7" fill="none"/><rect x="186" y="98" width="10" height="26" rx="3" transform="rotate(30 191 111)" fill="#aab1bc"/></g>
          <!-- 样本管 -->
          ${[230, 240, 250, 260].map((x, i) => `<rect x="${x}" y="130" width="6" height="20" rx="3" fill="${['#c9302c', '#2e6ac9', '#d4a72c', '#6a8a3a'][i]}" opacity=".85"/>`).join('')}
          <rect x="296" y="124" width="64" height="26" fill="#1c2226" stroke="#4a5e68"/></g>
        <!-- 冷冻柜 -->
        <g><rect x="352" y="60" width="44" height="126" rx="4" fill="#dfe6ea" stroke="#8a929e" stroke-width="3"/><path d="M352 120H396" stroke="#8a929e" stroke-width="3"/><rect x="386" y="86" width="4" height="20" fill="#555"/><rect x="386" y="140" width="4" height="26" fill="#555"/></g>
        <path d="M0 0L60 0L0 60Z" fill="#000" opacity=".2"/>`;
    },
    mourning(u) {
      return `<defs><linearGradient id="w${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2c34"/><stop offset="1" stop-color="#14151a"/></linearGradient><radialGradient id="cg${u}" cx=".5" cy=".6" r=".5"><stop offset="0" stop-color="#ffcf78" stop-opacity=".4"/><stop offset="1" stop-color="#ffcf78" stop-opacity="0"/></radialGradient></defs>
        <rect width="400" height="240" fill="url(#w${u})"/>
        <!-- 白幔 -->
        <g fill="#e6e8ee" opacity=".92"><path d="M0 0H400V30Q350 46 300 28T200 30T100 28T0 30Z"/><path d="M0 0H44Q30 90 40 190H0Z M400 0H356Q370 90 360 190H400Z" opacity=".85"/></g>
        <g stroke="#b9bdc8" stroke-width="2" fill="none"><path d="M16 10Q10 90 18 190M30 10Q24 90 30 190M384 10Q390 90 382 190M370 10Q376 90 370 190"/></g>
        <!-- 挽联 -->
        <g><rect x="88" y="44" width="26" height="120" fill="#f4f2ec" stroke="#333"/><rect x="286" y="44" width="26" height="120" fill="#f4f2ec" stroke="#333"/><g font-size="15" fill="#111" font-family="'Noto Serif SC','Songti SC','SimSun',serif" text-anchor="middle"><text x="101" y="64">音</text><text x="101" y="86">容</text><text x="101" y="108">宛</text><text x="101" y="130">在</text><text x="299" y="64">德</text><text x="299" y="86">泽</text><text x="299" y="108">长</text><text x="299" y="130">存</text></g></g>
        <!-- 遗像 -->
        <g><rect x="166" y="42" width="68" height="84" fill="#111" stroke="#c9c9c9" stroke-width="3"/><rect x="172" y="48" width="56" height="72" fill="#8a8a8a"/><circle cx="200" cy="76" r="14" fill="#cfcfcf"/><path d="M174 120Q200 88 226 120Z" fill="#555"/><path d="M166 42L190 42L166 66Z" fill="#000"/><path d="M234 126L214 126L234 106Z" fill="#000"/></g>
        <!-- 灵案 -->
        <g><rect x="120" y="150" width="160" height="14" fill="#4a2a1a"/><rect x="130" y="164" width="140" height="28" fill="#3a2014"/>
          ${[134, 262].map((x) => `<rect x="${x - 3}" y="124" width="6" height="26" fill="#f4efe0"/><path class="flame" d="M${x} 122q-5-9 0-16q5 7 0 16z" fill="#ffd27a"/><circle cx="${x}" cy="114" r="22" fill="url(#cg${u})" class="flick2"/>`).join('')}
          <rect x="186" y="136" width="28" height="14" fill="#6a4a30"/><path d="M196 136V122M204 136V120" stroke="#c9a14a" stroke-width="2"/><g class="steam" stroke="#fff" fill="none" stroke-width="2" opacity=".55"><path d="M196 120q-6-10 0-18t0-14"/><path d="M204 118q6-10 0-18t0-14"/></g>
          <g fill="#f6f6f0">${[150, 160, 240, 252].map((x, i) => `<circle cx="${x}" cy="${146 + (i % 2) * 2}" r="6"/><circle cx="${x}" cy="${146 + (i % 2) * 2}" r="2.4" fill="#f5d76e"/>`).join('')}</g></g>
        <!-- 棺木 -->
        <path d="M110 192H290L310 216H90Z" fill="#1a0e08" stroke="#4a2a1a" stroke-width="3"/><path d="M110 192L130 200H270L290 192" stroke="#4a2a1a" stroke-width="2" fill="none"/>
        <path d="M0 214H400V240H0Z" fill="#121216"/>
        <!-- 白灯笼 -->
        ${[60, 340].map((x) => `<g class="swing" style="transform-origin:${x}px 46px"><path d="M${x} 46v14" stroke="#333"/><ellipse cx="${x}" cy="82" rx="16" ry="22" fill="#f2f0e8"/><path d="M${x - 10} 82h20" stroke="#cfcdc4"/><text x="${x}" y="88" font-size="18" text-anchor="middle" fill="#222" font-family="'Noto Serif SC','Songti SC','SimSun',serif">奠</text><circle cx="${x}" cy="82" r="30" fill="#ffe7a8" opacity=".12"/></g>`).join('')}
        <path d="M0 0L60 0L0 60Z" fill="#000" opacity=".25"/>`;
    },
    coverOldHouse(u) {
      return `<defs><linearGradient id="sk${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1318"/><stop offset="1" stop-color="#2a3d42"/></linearGradient>
        <radialGradient id="mn${u}"><stop offset="0" stop-color="#e6f0e0" stop-opacity=".7"/><stop offset="1" stop-color="#cfe0d8" stop-opacity="0"/></radialGradient></defs>
        <rect width="400" height="240" fill="url(#sk${u})"/><circle cx="320" cy="50" r="54" fill="url(#mn${u})"/><circle cx="320" cy="50" r="12" fill="#e8efdc"/>
        <g class="drift" fill="#1a2a30" opacity=".8"><ellipse cx="300" cy="52" rx="60" ry="8"/><ellipse cx="90" cy="40" rx="50" ry="6"/></g>
        <!-- 远山 -->
        <path d="M0 150Q60 110 120 140T240 130T400 145V240H0Z" fill="#101c22"/>
        <!-- 老宅：白墙黑瓦 + 马头墙 -->
        <g><rect x="90" y="132" width="220" height="64" fill="#d7d9d2"/><path d="M80 132H320L300 114H100Z" fill="#14181a"/><path d="M70 136Q84 128 100 114M330 136Q316 128 300 114" stroke="#14181a" stroke-width="4" fill="none"/>
          <path d="M150 114V94l14-6 14 6V114M222 114V94l14-6 14 6V114" fill="#d7d9d2" stroke="#14181a" stroke-width="3"/><path d="M146 94L164 86L182 94M218 94L236 86L254 94" stroke="#14181a" stroke-width="4" fill="none"/>
          <path d="M100 114H300" stroke="#0a0d0e" stroke-width="3"/>
          <!-- 窗与门 -->
          ${[112, 136, 252, 276].map((x, i) => `<rect x="${x}" y="150" width="14" height="22" fill="${i === 1 ? '#ffd27a' : '#1a2228'}" ${i === 1 ? 'class="flick"' : ''} stroke="#5a3a24" stroke-width="2"/>`).join('')}
          <path d="M184 196v-36a16 16 0 0 1 32 0v36z" fill="#2a1612"/><path d="M200 164v32" stroke="#14181a" stroke-width="2"/><circle cx="196" cy="182" r="2" fill="#c9a14a"/><circle cx="204" cy="182" r="2" fill="#c9a14a"/>
          <!-- 白灯笼（丧事） -->
          ${[176, 224].map((x) => `<g class="swing" style="transform-origin:${x}px 156px"><path d="M${x} 156v6" stroke="#333"/><ellipse cx="${x}" cy="172" rx="8" ry="11" fill="#f2f0e8"/><circle cx="${x}" cy="172" r="18" fill="#ffe7a8" opacity=".12"/></g>`).join('')}
          <path d="M96 196H304" stroke="#4a4e50" stroke-width="3"/></g>
        <!-- 垂柳 -->
        <g stroke="#1c3a30" stroke-width="2" fill="none" class="drift2"><path d="M44 80Q46 130 40 190M52 78Q58 128 52 190M60 82Q66 126 62 188M36 86Q32 130 30 186"/><path d="M44 80Q60 60 80 70" stroke-width="4"/></g>
        <path d="M0 196Q100 190 200 198T400 194V240H0Z" fill="#1a2a2c"/><path d="M180 198h40l20 42H160Z" fill="#2a3c3e"/>
        <g opacity=".35" fill="#cfe0d8" class="drift"><ellipse cx="90" cy="206" rx="100" ry="8"/><ellipse cx="320" cy="214" rx="100" ry="9"/></g>
        ${rain(90, 23)}`;
    },
    garden(u) {
      return `<defs><linearGradient id="sk${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0c161a"/><stop offset="1" stop-color="#2a3e42"/></linearGradient></defs>
        <rect width="400" height="240" fill="url(#sk${u})"/>
        <!-- 院墙 + 瓦檐 -->
        <rect y="70" width="400" height="86" fill="#cfd3cc"/><path d="M0 70H400V58H0Z" fill="#14181a"/><path d="M0 58H400" stroke="#0a0d0e" stroke-width="3"/><g stroke="#a0a59c" stroke-width="2">${Array.from({ length: 8 }, (_, i) => `<path d="M${i * 52} 70V156"/>`).join('')}</g>
        <!-- 月洞门 -->
        <g><circle cx="200" cy="124" r="44" fill="#1a2c30" stroke="#14181a" stroke-width="6"/><path d="M168 150Q200 90 232 150" fill="#2a4a40" opacity=".8"/><circle cx="200" cy="124" r="44" fill="none" stroke="#cfd3cc" stroke-width="3"/><path d="M160 156l40-40 40 40" stroke="#3a5a50" stroke-width="3" fill="none" opacity=".6"/></g>
        <!-- 假山 + 竹 -->
        <g><path d="M20 190Q24 130 52 120Q70 126 76 150Q92 160 96 190Z" fill="#5a6460"/><path d="M40 150q10-10 20 0M52 170q10-6 20 4" stroke="#3a4440" stroke-width="3" fill="none"/>
          <g stroke="#2a5a3a" stroke-width="4" class="drift2"><path d="M300 190V60M318 190V50M336 190V70"/></g><g fill="#3a8a52" opacity=".8" class="drift2">${Array.from({ length: 12 }, (_, i) => `<path d="M${300 + (i % 3) * 18} ${64 + i * 8}l14-4-8 8z"/>`).join('')}</g></g>
        <!-- 池塘与荷叶 -->
        <path d="M0 190H400V240H0Z" fill="#14181a"/><ellipse cx="200" cy="214" rx="130" ry="20" fill="#16303a"/><ellipse cx="200" cy="214" rx="130" ry="20" fill="none" stroke="#7aa0aa" stroke-width="1.6" opacity=".6"/>
        ${[[150, 212], [190, 220], [240, 210], [270, 218]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="12" ry="4" fill="#2a6a4a"/>`).join('')}<g class="pulse"><circle cx="190" cy="218" r="3.4" fill="#f4b6c0"/></g>
        <!-- 石灯笼 -->
        <g><rect x="228" y="150" width="12" height="40" fill="#8a8f8a"/><rect x="220" y="138" width="28" height="14" fill="#9aa09a"/><rect x="226" y="142" width="16" height="8" fill="#ffd27a" class="flick"/><path d="M216 138L234 124L252 138Z" fill="#7a807a"/><circle cx="234" cy="146" r="26" fill="#ffd27a" opacity=".12"/></g>
        <!-- 白灯笼 -->
        <g class="swing" style="transform-origin:116px 62px"><path d="M116 62v12" stroke="#333"/><ellipse cx="116" cy="90" rx="12" ry="16" fill="#f2f0e8"/><circle cx="116" cy="90" r="24" fill="#ffe7a8" opacity=".12"/></g>
        <g opacity=".3" fill="#cfe0d8" class="drift"><ellipse cx="100" cy="200" rx="110" ry="10"/></g>
        ${rain(80, 41)}`;
    }
  });

  function scene(id, o = {}) {
    const ck = 's|' + id + '|' + (o.cls || '') + '|' + (o.label || '');
    if (cache.has(ck)) return cache.get(ck);
    const r = sceneRaw(id, o); cache.set(ck, r); return r;
  }
  function sceneRaw(id, o = {}) {
    const u = ++uid;
    const fn = SCENES[id] || SCENES.cover;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" class="scene s-${id} ${o.cls || ''}" viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${o.label || ''}">${fn(u)}${vignette(u)}</svg>`;
    // 手机/低配设备：场景改成静态图片（浏览器只绘制一次再缓存），不再每帧重绘大 SVG 和各种环境动画，避免一闪一闪、一卡一卡
    if (LITE_ART) return `<img class="scene s-${id} ${o.cls || ''}" alt="${o.label || ''}" decoding="sync" draggable="false" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}">`;
    return svg.replace(' xmlns="http://www.w3.org/2000/svg"', '');
  }

  // ---------------------------------------------------------------- 每个案件、每个地点各有一张不重复的图
  // 以基础场景为底，再按“案件+地点”叠加：不同的取景/构图、色调、光线、天气，以及与该地点相关的随机摆设。
  const hash32 = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const rngSeed = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  // 摆设：原点在底部中心，高度约 20–60
  const PROPS = {
    candle: { kw: '餐宴厅堂祭灵仪式教堂卧', g: (a, b) => `<rect x="-3" y="-26" width="6" height="26" fill="#efe6cf"/><path d="M0 -38q-5 7 0 11q5-4 0-11z" fill="#ffc857"/><circle cx="0" cy="-33" r="11" fill="#ffc857" opacity=".13"/><rect x="-8" y="-3" width="16" height="3" fill="${b}"/>` },
    vase: { kw: '厅堂客卧走廊门花', g: (a, b) => `<path d="M-8 0Q-14 -20 -5 -30L-4 -38H4L5 -30Q14 -20 8 0Z" fill="${a}"/><path d="M-6 -14Q0 -10 6 -14" stroke="${b}" stroke-width="1.6" fill="none"/><path d="M0 -38l-6 -14M0 -38l6 -12M0 -38l0 -16" stroke="#6a8a4a" stroke-width="1.4"/>` },
    bottle: { kw: '酒窖餐厨吧药实验诊', g: (a, b) => `<rect x="-5" y="-34" width="10" height="34" rx="2" fill="${a}"/><rect x="-2" y="-44" width="4" height="12" fill="${a}"/><rect x="-2.6" y="-46" width="5.2" height="3" fill="${b}"/><rect x="-4" y="-22" width="8" height="10" fill="#efe6cf" opacity=".85"/>` },
    glass: { kw: '餐宴酒吧厅', g: (a, b) => `<path d="M-8 -26h16l-2 12a6 6 0 0 1-12 0z" fill="#d9e8ff" opacity=".35" stroke="#bcd" stroke-width="1"/><path d="M0 -10v10M-6 0h12" stroke="#bcd" stroke-width="1.6"/><path d="M-6 -20h12" stroke="${a}" stroke-width="3" opacity=".7"/>` },
    clock: { kw: '厅走廊书房客堂门', wall: 1, g: (a, b) => `<circle r="14" fill="#efe6cf" stroke="${b}" stroke-width="3"/><path d="M0 0V-9M0 0L7 4" stroke="#2a2018" stroke-width="2" stroke-linecap="round"/><circle r="1.6" fill="#2a2018"/>` },
    painting: { kw: '厅走廊书房卧客堂画廊', wall: 1, g: (a, b) => `<rect x="-17" y="-22" width="34" height="44" fill="${b}"/><rect x="-14" y="-19" width="28" height="38" fill="${a}"/><path d="M-14 8Q-4 -6 4 4T14 -2V19H-14Z" fill="#1d2a3a" opacity=".6"/><circle cx="5" cy="-8" r="4" fill="#f0e2b0" opacity=".8"/>` },
    mask: { kw: '舞台后台剧场镜演戏厅', wall: 1, g: (a, b) => `<path d="M-13 -16Q0 -24 13 -16Q15 8 0 18Q-15 8 -13 -16Z" fill="${a}" stroke="${b}" stroke-width="1.6"/><path d="M-8 -6q3 -3 6 0M2 -6q3 -3 6 0M-5 8q5 4 10 0" stroke="#1a1410" stroke-width="2" fill="none"/>` },
    window: { kw: '室厅卧书客走廊阁', wall: 1, g: (a, b) => `<rect x="-18" y="-24" width="36" height="48" fill="#12203a" stroke="${b}" stroke-width="3"/><path d="M0 -24V24M-18 0H18" stroke="${b}" stroke-width="2"/><circle cx="8" cy="-12" r="5" fill="#f3efd9" opacity=".85"/>` },
    key: { kw: '门锁室卧密书', g: (a, b) => `<circle cx="-8" cy="-3" r="5" fill="none" stroke="#d4af37" stroke-width="2.4"/><path d="M-3 -3H12M8 -3v5M12 -3v4" stroke="#d4af37" stroke-width="2.4" fill="none"/>` },
    rope: { kw: '船舱甲板码头渡轮仓库', g: (a, b) => `<ellipse cx="0" cy="-5" rx="14" ry="5" fill="none" stroke="#b79a62" stroke-width="3.4"/><ellipse cx="0" cy="-9" rx="11" ry="4" fill="none" stroke="#b79a62" stroke-width="3.4"/><path d="M14 -5q10 -2 16 4" stroke="#b79a62" stroke-width="3" fill="none"/>` },
    knife: { kw: '厨餐工具房', g: (a, b) => `<path d="M-14 -3L10 -6L14 -2L-14 1Z" fill="#cfd5dc"/><rect x="10" y="-7" width="14" height="6" rx="2" fill="#4a3226"/>` },
    pot: { kw: '厨餐', g: (a, b) => `<path d="M-14 -22h28l-3 22h-22z" fill="${a}"/><rect x="-16" y="-25" width="32" height="4" rx="2" fill="${b}"/><path d="M14 -16h10" stroke="${b}" stroke-width="3"/>` },
    cup: { kw: '餐厨客厅书房卧', g: (a, b) => `<path d="M-8 -14h16l-2 14h-12z" fill="#efe9dc"/><path d="M8 -11q8 0 0 8" stroke="#efe9dc" stroke-width="2" fill="none"/><ellipse cx="0" cy="-14" rx="8" ry="2" fill="#6a3a22"/>` },
    suitcase: { kw: '客卧旅码头船舱房', g: (a, b) => `<rect x="-20" y="-24" width="40" height="24" rx="3" fill="${a}"/><rect x="-6" y="-28" width="12" height="4" rx="1.5" fill="none" stroke="${b}" stroke-width="2"/><rect x="-20" y="-14" width="40" height="3" fill="${b}"/>` },
    chair: { kw: '厅餐书房客堂室', g: (a, b) => `<rect x="-12" y="-22" width="24" height="5" fill="${a}"/><rect x="-12" y="-52" width="5" height="32" fill="${a}"/><rect x="-12" y="-52" width="24" height="5" fill="${a}"/><rect x="-11" y="-17" width="3" height="17" fill="${b}"/><rect x="8" y="-17" width="3" height="17" fill="${b}"/>` },
    lamp: { kw: '书房卧客厅客堂', g: (a, b) => `<path d="M-10 -34h20l5 16h-30z" fill="#f1d9a0"/><circle cx="0" cy="-22" r="22" fill="#ffd27a" opacity=".16"/><rect x="-1.6" y="-18" width="3.2" height="16" fill="${b}"/><rect x="-8" y="-3" width="16" height="3" rx="1.5" fill="${b}"/>` },
    plant: { kw: '花园温室庭院厅客堂窗', g: (a, b) => `<path d="M-9 0L-7 -14H7L9 0Z" fill="${b}"/><path d="M0 -14Q-14 -22 -12 -40Q-2 -34 0 -14M0 -14Q14 -24 12 -42Q2 -34 0 -14M0 -14Q0 -30 0 -48" stroke="#3f7a3a" stroke-width="5" fill="none" stroke-linecap="round"/>` },
    barrel: { kw: '酒窖地仓库船舱', g: (a, b) => `<path d="M-14 -34Q-20 -17 -14 0H14Q20 -17 14 -34Z" fill="${a}"/><path d="M-16 -24H16M-16 -10H16" stroke="${b}" stroke-width="2.4"/>` },
    books: { kw: '书图馆房室研', g: (a, b) => `<rect x="-16" y="-8" width="32" height="8" fill="${a}"/><rect x="-13" y="-16" width="26" height="8" fill="${b}"/><rect x="-14" y="-23" width="24" height="7" fill="#4a3a5a"/><path d="M-13 -4h26M-10 -12h20" stroke="#d4af37" stroke-width="1" opacity=".7"/>` },
    camera: { kw: '监控机房门口走廊录像室', wall: 1, g: (a, b) => `<rect x="-14" y="-8" width="28" height="16" rx="3" fill="#2a2d33"/><circle cx="10" cy="0" r="6" fill="#1a1c20" stroke="#555"/><circle cx="-9" cy="-3" r="2.2" fill="#e57373"/><path d="M0 8v10" stroke="#555" stroke-width="3"/>` },
    radio: { kw: '客厅卧留声音乐舞台后台', g: (a, b) => `<rect x="-17" y="-24" width="34" height="24" rx="3" fill="${a}"/><circle cx="-7" cy="-12" r="7" fill="#2a2018"/><circle cx="-7" cy="-12" r="4" fill="${b}" opacity=".5"/><circle cx="10" cy="-16" r="2.6" fill="${b}"/><circle cx="10" cy="-8" r="2.6" fill="${b}"/>` },
    lantern: { kw: '花园甲板码头阁院门外雪', g: (a, b) => `<path d="M0 -50v-6" stroke="#333" stroke-width="2"/><rect x="-8" y="-50" width="16" height="22" rx="4" fill="#d8b36a"/><path d="M-8 -39h16" stroke="${b}" stroke-width="1.6"/><circle cx="0" cy="-39" r="22" fill="#ffd27a" opacity=".16"/><path d="M0 -28v10" stroke="#333" stroke-width="2"/>` },
    crate: { kw: '仓库码头船舱车库拍卖', g: (a, b) => `<rect x="-17" y="-28" width="34" height="28" fill="${a}"/><path d="M-17 -28L17 0M17 -28L-17 0" stroke="${b}" stroke-width="2.4"/><rect x="-17" y="-28" width="34" height="28" fill="none" stroke="${b}" stroke-width="2.6"/>` },
    trophy: { kw: '拍卖厅书房大厅展', g: (a, b) => `<path d="M-9 -34h18q0 14 -9 18q-9 -4 -9 -18z" fill="#d4af37"/><rect x="-2" y="-17" width="4" height="10" fill="#d4af37"/><rect x="-9" y="-7" width="18" height="7" fill="${b}"/>` },
    umbrella: { kw: '门外庭院雨走廊入口', g: (a, b) => `<path d="M-22 -26Q0 -50 22 -26Z" fill="${a}"/><path d="M0 -26V0q0 5 5 5" stroke="#3a2a20" stroke-width="2.4" fill="none"/>` },
    mirror: { kw: '镜卧化妆更衣后台厅', wall: 1, g: (a, b) => `<ellipse rx="14" ry="22" fill="#9db8d0" opacity=".55" stroke="${b}" stroke-width="3"/><path d="M-5 -10L3 -18M-7 0L6 -13" stroke="#fff" stroke-width="1.6" opacity=".6"/>` },
    bell: { kw: '前台旅馆民宿门服务', g: (a, b) => `<path d="M-12 0Q-12 -16 0 -18Q12 -16 12 0Z" fill="#d4af37"/><rect x="-14" y="0" width="28" height="3" fill="${b}"/><circle cx="0" cy="-20" r="2.2" fill="#d4af37"/>` },
    syringe: { kw: '诊医药实验护病', g: (a, b) => `<rect x="-16" y="-4" width="24" height="7" rx="2" fill="#dfe8ee" stroke="#8a9aa6"/><path d="M8 0h14" stroke="#8a9aa6" stroke-width="1.6"/><rect x="-22" y="-5" width="6" height="9" fill="#8a9aa6"/><rect x="-12" y="-2" width="12" height="3" fill="${a}"/>` },
    skull: { kw: '古董地密祭灵', g: (a, b) => `<path d="M-10 -10Q-12 -26 0 -26Q12 -26 10 -10V-4H-10Z" fill="#e8e2d0"/><circle cx="-4" cy="-14" r="2.6" fill="#1a1410"/><circle cx="4" cy="-14" r="2.6" fill="#1a1410"/>` }
  };
  const PROP_KEYS = Object.keys(PROPS);
  const PAL = [['#6a3a2a', '#c9a14a'], ['#2e4a6a', '#9ab0c8'], ['#3d5a3a', '#cfa84a'], ['#5a2e3e', '#d9b36a'], ['#4a3a5a', '#bfa8d8'], ['#7a5a2a', '#e8d29a'], ['#2a5a5a', '#9fd0c8'], ['#5a5a5a', '#d0d0d0']];

  function sceneFor(caseId, locId, baseId, o) {
    o = o || {};
    const ck = 'sf|' + caseId + '|' + locId + '|' + baseId + '|' + (o.cls || '');
    if (cache.has(ck)) return cache.get(ck);
    const u = ++uid, seed = hash32(caseId + '/' + locId), r = rngSeed(seed), fn = SCENES[baseId] || SCENES.cover;
    const cover = locId === 'cover';
    const hue = Math.floor(r() * 360);
    // 取景：不同的缩放与偏移，水平翻转
    const z = 1 + r() * (cover ? 0.14 : 0.3), vw = 400 / z, vh = 240 / z;
    const vx = r() * (400 - vw), vy = r() * (240 - vh) * 0.7, flip = r() < 0.5;
    const rawBase = fn(u);
    // 选摆设：优先与地点名称/描述相关
    const text = (o.text || '') + '';
    const rel = PROP_KEYS.filter((k) => [...PROPS[k].kw].some((ch) => text.includes(ch)));
    const pool = rel.length >= 3 ? rel : rel.concat(PROP_KEYS.filter((k) => !rel.includes(k)));
    const pick = (n, wallOnly) => {
      const out = []; let guard = 0;
      while (out.length < n && guard++ < 60) {
        const k = rel.length && r() < 0.7 ? rel[Math.floor(r() * rel.length)] : PROP_KEYS[Math.floor(r() * PROP_KEYS.length)];
        const w = !!PROPS[k].wall; if (wallOnly !== undefined && w !== wallOnly) continue;
        if (!out.includes(k)) out.push(k);
      }
      return out;
    };
    void pool;
    const slots = [[28, 118], [150, 248], [290, 372]];
    let props = '';
    pick(cover ? 1 : 3, false).forEach((k, i) => {
      const [a, b] = slots[(i + Math.floor(r() * 3)) % 3]; const x = a + r() * (b - a), y = 196 + r() * 24, sc = 0.8 + r() * 0.55, pal = PAL[Math.floor(r() * PAL.length)];
      props += `<g transform="translate(${x.toFixed(0)} ${y.toFixed(0)}) scale(${sc.toFixed(2)})" opacity=".96"><ellipse cx="0" cy="1" rx="${(16 * sc).toFixed(0)}" ry="3" fill="#000" opacity=".28" transform="scale(${(1 / sc).toFixed(2)})"/>${PROPS[k].g(pal[0], pal[1])}</g>`;
    });
    pick(cover ? 0 : 1, true).forEach((k) => {
      const x = 40 + r() * 320, y = 56 + r() * 26, sc = 0.9 + r() * 0.5, pal = PAL[Math.floor(r() * PAL.length)];
      props += `<g transform="translate(${x.toFixed(0)} ${y.toFixed(0)}) scale(${sc.toFixed(2)})" opacity=".94">${PROPS[k].g(pal[0], pal[1])}</g>`;
    });
    // 光线 / 天气
    const light = Math.floor(r() * 8), lx = 60 + r() * 280, lid = 'lg' + u;
    let L = '';
    switch (light) {
      case 0: L = `<polygon points="${lx - 20},0 ${lx + 30},0 ${lx + 130},240 ${lx - 60},240" fill="#fff" opacity=".1"/>`; break;
      case 1: L = `<defs><radialGradient id="${lid}"><stop offset="0" stop-color="#ffcf7a" stop-opacity=".5"/><stop offset="1" stop-color="#ffcf7a" stop-opacity="0"/></radialGradient></defs><circle cx="${lx}" cy="${60 + r() * 60}" r="130" fill="url(#${lid})"/>`; break;
      case 2: L = `<ellipse cx="120" cy="222" rx="190" ry="26" fill="#cfe0ea" opacity=".18"/><ellipse cx="300" cy="206" rx="170" ry="20" fill="#cfe0ea" opacity=".13"/>`; break;
      case 3: L = `<g stroke="#bcd6ff" stroke-width=".8" opacity=".35">${Array.from({ length: 36 }, () => { const x = r() * 420, y = r() * 220; return `<path d="M${x.toFixed(0)} ${y.toFixed(0)}l-5 14"/>`; }).join('')}</g>`; break;
      case 4: L = `<defs><linearGradient id="${lid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".3"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><polygon points="${lx - 10},0 ${lx + 10},0 ${lx + 90},240 ${lx - 90},240" fill="url(#${lid})"/>`; break;
      case 5: L = `<g fill="#fff" opacity=".4">${Array.from({ length: 26 }, () => `<circle cx="${(r() * 400).toFixed(0)}" cy="${(r() * 240).toFixed(0)}" r="${(0.7 + r() * 1.6).toFixed(1)}"/>`).join('')}</g>`; break;
      case 6: L = `<defs><radialGradient id="${lid}" cx=".1" cy=".1" r=".9"><stop offset="0" stop-color="#ff3b30" stop-opacity=".4"/><stop offset="1" stop-color="#ff3b30" stop-opacity="0"/></radialGradient></defs><rect width="400" height="240" fill="url(#${lid})"/>`; break;
      default: L = `<g fill="#fff" opacity=".1">${Array.from({ length: 5 }, (_, i) => `<polygon points="${lx - 60 + i * 26},0 ${lx - 46 + i * 26},0 ${lx + 40 + i * 26},240 ${lx + 26 + i * 26},240"/>`).join('')}</g>`;
    }
    // 色调：低饱和的整体着色 + 暗角
    const tint = `<rect width="400" height="240" fill="hsl(${hue} 55% ${cover ? 34 : 30}%)" opacity="${(0.16 + r() * 0.12).toFixed(2)}"/>`;
    // 封面：案名首字做成大水印
    const mark = cover && o.title ? `<text x="${flip ? 120 : 280}" y="190" text-anchor="middle" font-size="190" font-family="serif" fill="#fff" opacity=".1">${String(o.title).charAt(0).replace(/[<&]/g, '')}</text>` : '';
    const inner = `<g transform="${flip ? 'translate(400 0) scale(-1 1)' : ''}">${rawBase}</g>${tint}${L}${mark}${props}${vignette(u)}`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" class="scene s-${baseId} ${o.cls || ''}" viewBox="${vx.toFixed(1)} ${vy.toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${o.label || ''}">${inner}</svg>`;
    // 手机：烘焙成静态图片，并加一层色相偏移让同一底图看起来更不同
    const out = LITE_ART
      ? `<img class="scene s-${baseId} ${o.cls || ''}" alt="${o.label || ''}" decoding="sync" draggable="false" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}">`
      : svg.replace(' xmlns="http://www.w3.org/2000/svg"', '');
    cache.set(ck, out); return out;
  }

  // ---------------------------------------------------------------- 按“外观设定”生成立绘
  const L_SKIN = { fair: ['#f6dcc4', '#dcae92'], light: ['#f0cfae', '#cf9f7c'], tan: ['#dcaa80', '#b88160'], brown: ['#b9805c', '#8f5e42'], deep: ['#8a5a3e', '#64402c'] };
  const L_HAIR = { black: '#17151c', brown: '#4a3022', auburn: '#6b3524', grey: '#8e8d90', white: '#dcdde2', blonde: '#c9a45a', red: '#9a3a22', silver: '#b9bcc4' };
  const HEAD_F = 'M64 92C64 62 80 50 100 50C120 50 136 62 136 92C136 116 122 144 100 147C78 144 64 116 64 92Z';
  const MOODS = {
    neutral: { m: 'M92 128Q100 129 108 128', b: {} },
    smirk: { m: 'M90 127Q101 133 112 123', b: { lr: 1.4 } },
    worried: { m: 'M93 130Q100 127 107 130', b: { tilt: 2.2, arch: 4 } },
    stern: { m: 'M92 129H108', b: { tilt: -2.2 } },
    sad: { m: 'M93 131Q100 126 107 131', b: { tilt: 2.6, arch: 4 } },
    smile: { m: 'M89 126Q100 137 111 126', b: { arch: 4 } },
    tired: { m: 'M93 129Q100 130 107 129', b: { tilt: 1 }, lid: .9, bags: true },
    sly: { m: 'M88 127Q103 134 113 122', b: { lr: 2 }, lid: 1.1 },
    // —— 审问时的情绪表情 ——
    nervous: { m: 'M92 130Q96 127 100 130Q104 133 108 130', b: { tilt: 2.4, arch: 4.5 }, lid: -0.3, pr: 2.5, fx: 'sweat1' },
    scared: { m: 'M94 129Q100 139 106 129Q100 125 94 129Z', b: { tilt: 3.2, arch: 6, y: 82 }, lid: -1.7, pr: 2, fx: 'sweat2', pale: 1 },
    panic: { m: 'M93 128Q100 142 107 128Q100 123 93 128Z', b: { tilt: 3.6, arch: 6.5, y: 81 }, lid: -2.1, pr: 1.7, fx: 'sweat3', pale: 1 },
    shocked: { m: 'M96 127a4 5.2 0 1 0 8 0a4 5.2 0 1 0-8 0', b: { tilt: 0.5, arch: 7, y: 81 }, lid: -2, pr: 2, fx: 'sweat1' },
    angry: { m: 'M91 132Q100 124 109 132', b: { tilt: -3.6, arch: 0.6, w: 4 }, lid: 0.7, pr: 3, fx: 'rage' },
    annoyed: { m: 'M92 130Q100 127 108 131', b: { tilt: -1.5, lr: 1 }, lid: 0.55, fx: 'blush' },
    weep: { m: 'M93 132Q100 125 107 132', b: { tilt: 2.8, arch: 4.5 }, lid: 0.4, fx: 'tears' }
  };
  const MOOD_FX = {
    sweat1: '<path d="M127 76q-4 8 0 11q4-3 0-11z" fill="#bfe6ff" opacity=".92"/>',
    sweat2: '<path d="M127 76q-4 8 0 11q4-3 0-11zM72 80q-3.5 7 0 10q3.5-3 0-10z" fill="#bfe6ff" opacity=".92"/>',
    sweat3: '<path d="M127 74q-4 8 0 11q4-3 0-11zM72 78q-3.5 7 0 10q3.5-3 0-10zM134 100q-3 6 0 9q3-3 0-9z" fill="#bfe6ff" opacity=".92"/><path d="M60 64l-6-3M140 64l6-3M58 78l-7 0M142 78l7 0" stroke="#e8e8f0" stroke-width="1.6" stroke-linecap="round" opacity=".6"/>',
    rage: '<ellipse cx="75" cy="112" rx="10" ry="7" fill="#e0453a" opacity=".38"/><ellipse cx="125" cy="112" rx="10" ry="7" fill="#e0453a" opacity=".38"/><path d="M121 64l5 3-3 5M132 62l-6 4 4 5" stroke="#d1453b" stroke-width="2" fill="none" stroke-linecap="round"/>',
    blush: '<ellipse cx="75" cy="112" rx="9" ry="6" fill="#e0453a" opacity=".24"/><ellipse cx="125" cy="112" rx="9" ry="6" fill="#e0453a" opacity=".24"/>',
    tears: '<path d="M82 103q-3.5 9 0 13q3.5-4 0-13zM118 103q-3.5 9 0 13q3.5-4 0-13z" fill="#a9d6ff" opacity=".9"/>'
  };
  const darken = (hex, k) => {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
    return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('');
  };

  function hairParts(style, hc, look) {
    let back = '', front = '';
    const hl = darken(hc, 1.6);
    const sheen = (d) => `<path d="${d}" stroke="${hl}" stroke-width="2" fill="none" stroke-linecap="round" opacity=".55"/>`;
    switch (style) {
      case 'slick':
        front = `<path d="M60 92C54 58 76 38 102 38C130 38 148 60 140 94C138 80 134 68 124 62C112 70 86 70 70 66C64 72 62 82 60 92Z" fill="${hc}"/>` + sheen('M78 52C92 46 114 46 128 54M84 60C98 55 114 56 126 62'); break;
      case 'sidepart':
        front = `<path d="M62 92C56 60 80 42 104 42C128 42 142 60 138 92C136 78 130 66 118 62C108 58 88 62 78 70C70 76 64 84 62 92Z" fill="${hc}"/><path d="M92 46C88 56 80 64 72 68" stroke="${darken(hc, .6)}" stroke-width="1.6" fill="none"/>` + sheen('M100 46C116 46 130 52 134 62'); break;
      case 'messy':
        front = `<path d="M60 92C54 62 74 40 100 40C128 38 148 60 140 92C138 78 132 70 124 66L120 54L110 66L102 50L94 66L84 54L78 68C68 72 62 82 60 92Z" fill="${hc}"/>` + sheen('M80 54l6 8M104 52l4 9M118 56l2 8'); break;
      case 'bald':
        front = `<path d="M62 94C60 82 62 74 66 70L69 94Z M138 94C140 82 138 74 134 70L131 94Z" fill="${hc}"/><ellipse cx="92" cy="58" rx="14" ry="6" fill="#fff" opacity=".16"/>`; break;
      case 'cap': {
        const cc = look.accent || '#4e3d2d';
        front = `<path d="M62 86C62 56 92 44 110 46C130 48 142 62 140 86C128 76 74 76 62 86Z" fill="${cc}"/><path d="M54 88C70 76 132 76 148 88C134 94 68 94 54 88Z" fill="${darken(cc, .75)}"/><path d="M62 94C58 84 58 80 60 78L66 96Z M138 94C142 84 142 80 140 78L134 96Z" fill="${hc}"/>`; break;
      }
      case 'bob':
        back = `<path d="M54 102C50 60 74 34 100 34C128 34 150 60 146 104C146 128 140 142 130 148L126 114L74 114L70 148C60 142 54 128 54 102Z" fill="${hc}"/>`;
        front = `<path d="M62 92C62 64 82 52 100 52C118 52 138 64 138 92C124 80 112 72 100 74C88 72 76 80 62 92Z" fill="${hc}"/>` + sheen('M72 66C84 58 100 56 116 60'); break;
      case 'long':
        back = `<path d="M50 102C44 56 72 32 100 32C130 32 156 56 150 104C152 140 152 172 160 214L130 214C132 172 134 134 130 114L70 114C66 134 68 172 70 214L40 214C48 172 48 140 50 102Z" fill="${hc}"/>`;
        front = `<path d="M62 90C66 62 88 50 106 50C124 52 140 66 138 92C128 74 110 66 92 70C80 74 68 82 62 90Z" fill="${hc}"/>` + sheen('M70 70C84 58 104 56 120 60'); break;
      case 'bun':
        back = `<circle cx="100" cy="34" r="16" fill="${hc}"/><path d="M92 28q8-6 16 0" stroke="${hl}" stroke-width="2" fill="none" opacity=".5"/>`;
        front = `<path d="M62 92C58 62 80 46 100 46C122 46 142 62 138 92C136 78 126 66 112 62C98 60 82 64 72 74C66 80 62 86 62 92Z" fill="${hc}"/>`; break;
      case 'ponytail':
        back = `<path d="M130 80C160 84 168 120 150 160C148 130 142 108 132 98Z" fill="${hc}"/>`;
        front = `<path d="M62 90C58 60 78 44 100 44C124 44 142 60 138 90C134 74 126 64 112 62C96 66 74 66 66 76Z" fill="${hc}"/>` + sheen('M76 54C92 48 112 48 126 56'); break;
      case 'curly': {
        const r = rng(5), c = [];
        for (let i = 0; i < 16; i++) { const a = Math.PI * (1.05 + i / 15 * 0.9) + Math.PI * 0; const x = 100 + Math.cos(a) * 44, y = 90 + Math.sin(a) * 46; c.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(11 + r() * 4).toFixed(1)}"/>`); }
        back = `<g fill="${hc}">${c.join('')}<circle cx="60" cy="100" r="11"/><circle cx="140" cy="100" r="11"/></g>`;
        front = `<path d="M64 88C68 66 88 58 100 58C114 58 134 66 136 88C124 74 112 70 100 70C88 70 76 74 64 88Z" fill="${hc}"/>`; break;
      }
      default: // short
        front = `<path d="M62 90C58 60 78 44 100 44C124 44 142 60 138 90C134 74 126 64 112 62C96 66 74 66 66 76Z" fill="${hc}"/>` + sheen('M76 54C92 48 112 48 126 56');
    }
    return { back, front };
  }

  function lookInner(look, age, u) {
    const f = !!look.female;
    const [sk1, sk2] = L_SKIN[look.skin] || L_SKIN.light;
    const hc = L_HAIR[look.hairColor] || L_HAIR.black;
    const mood = MOODS[look.mood] || MOODS.neutral;
    const oc = look.outfitColor || '#2a3550';
    const ac = look.accent || '#c9a14a';
    const acc = look.acc || [];
    const bg = look.bg || '#26324d';
    const head = f ? HEAD_F : HEAD;
    const defs = `<defs><linearGradient id="sk${u}" x1="0" x2="1"><stop offset="0" stop-color="${sk1}"/><stop offset=".62" stop-color="${sk1}"/><stop offset="1" stop-color="${sk2}"/></linearGradient>
      <radialGradient id="bg${u}" cx=".5" cy=".36" r=".85"><stop offset="0" stop-color="${bg}"/><stop offset=".6" stop-color="${bg}" stop-opacity=".55"/><stop offset="1" stop-color="#05070d"/></radialGradient>
      <linearGradient id="vg${u}" x1="0" y1="0" x2="0" y2="1"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></linearGradient>
      <radialGradient id="rim${u}" cx=".18" cy=".3" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>`;
    const backdrop = `<rect width="200" height="240" fill="url(#bg${u})"/><g opacity=".16" fill="#fff"><circle cx="30" cy="40" r="16"/><circle cx="168" cy="30" r="10"/><circle cx="176" cy="92" r="22"/><circle cx="20" cy="130" r="9"/></g>`;
    const { back, front } = hairParts(look.hair, hc, look);
    // ---- 衣服
    const od = darken(oc, .72), ol = darken(oc, 1.25);
    let hoodBack = '', body = `<path d="${BODY}" fill="${oc}"/>`, neckCover = '';
    const shirtW = '#ebe7df';
    switch (look.outfit) {
      case 'dress':
        body += `<path d="M84 162Q100 196 116 162Z" fill="${sk2}"/><path d="M82 162Q100 200 118 162" stroke="${ac}" stroke-width="2.4" fill="none"/>`; break;
      case 'qipao':
        body += `<path d="M86 158h28v16c-8 5-20 5-28 0z" fill="${oc}" stroke="${ac}" stroke-width="2"/><path d="M114 170L150 200M118 182l8 6M132 192l8 6" stroke="${ac}" stroke-width="2.2" stroke-linecap="round"/><circle cx="122" cy="182" r="2.4" fill="${ac}"/><circle cx="136" cy="194" r="2.4" fill="${ac}"/>`; break;
      case 'coat':
        body += `<path d="M84 162L98 206L66 238L44 192Z" fill="${od}"/><path d="M116 162L102 206L134 238L156 192Z" fill="${od}"/><path d="M92 164l8 18 8-18z" fill="${shirtW}"/>`; break;
      case 'uniform':
        body += `<path d="M84 160h32v16h-32z" fill="${od}"/><g fill="${ac}"><circle cx="100" cy="186" r="2.6"/><circle cx="100" cy="204" r="2.6"/><circle cx="100" cy="222" r="2.6"/></g><path d="M100 166V240" stroke="${od}" stroke-width="2"/><rect x="40" y="186" width="26" height="6" fill="${ac}"/><rect x="134" y="186" width="26" height="6" fill="${ac}"/>`; break;
      case 'apron':
        body = `<path d="${BODY}" fill="${shirtW}"/><path d="M80 162L120 162L132 240H68Z" fill="${oc}"/><path d="M80 162Q100 172 120 162" stroke="${od}" stroke-width="3" fill="none"/><path d="M84 160l-6-14M116 160l6-14" stroke="${od}" stroke-width="2"/>`; break;
      case 'robe':
        body += `<path d="M84 162L116 214M116 162L84 214" stroke="${od}" stroke-width="10"/><path d="M84 162L116 214" stroke="${ac}" stroke-width="2" opacity=".8"/>`; break;
      case 'shirt':
        body += `<path d="M86 160l14 16 14-16l-3 -4h-22z" fill="${shirtW}"/><path d="M100 176V240" stroke="${od}" stroke-width="1.6"/><g fill="${darken(oc, 1.5)}"><circle cx="100" cy="190" r="2"/><circle cx="100" cy="208" r="2"/><circle cx="100" cy="226" r="2"/></g>`; break;
      case 'turtleneck':
        neckCover = `<path d="M84 128h32v36c-10 6-22 6-32 0z" fill="${oc}"/><path d="M84 138q16 6 32 0M84 148q16 6 32 0" stroke="${od}" stroke-width="1.4" fill="none"/>`; break;
      case 'hoodie':
        hoodBack = `<path d="M60 140C60 116 140 116 140 140L150 190H50Z" fill="${od}"/>`;
        body += `<path d="M84 162Q100 180 116 162L112 168Q100 182 88 168Z" fill="${od}"/><path d="M94 172v26M106 172v26" stroke="#e9e6df" stroke-width="2.4" stroke-linecap="round"/><path d="M64 214h72v20H64z" fill="${od}" opacity=".6"/>`; break;
      case 'labcoat':
        body = `<path d="${BODY}" fill="${oc}"/><path d="M88 162L100 196L112 162Z" fill="${ac}"/><path d="M84 162L98 210L70 226L52 184Z" fill="${darken(oc, .92)}"/><path d="M116 162L102 210L130 226L148 184Z" fill="${darken(oc, .92)}"/><rect x="132" y="206" width="22" height="26" rx="3" fill="${darken(oc, .95)}" stroke="${darken(oc, .8)}"/><path d="M140 206v-8M146 206v-6" stroke="#2e6ac9" stroke-width="2.4" stroke-linecap="round"/>`; break;
      case 'vest':
        body = `<path d="${BODY}" fill="${shirtW}"/><path d="M84 162L100 224L116 162L134 182L130 240H70L66 182Z" fill="${oc}"/><g fill="${ac}"><circle cx="100" cy="196" r="2"/><circle cx="100" cy="212" r="2"/><circle cx="100" cy="228" r="2"/></g><path d="M86 160l14 14 14-14z" fill="${shirtW}"/>`; break;
      case 'jacket':
        body += `<path d="M84 162L98 214L74 236L52 196Z" fill="${od}"/><path d="M116 162L102 214L126 236L148 196Z" fill="${od}"/><path d="M90 164l10 24 10-24z" fill="${ac}"/><path d="M100 188V240" stroke="${ol}" stroke-width="2"/>`; break;
      case 'parka':
        hoodBack = `<path d="M50 150C54 112 146 112 150 150L158 200H42Z" fill="${darken(ac, .8)}"/>`;
        body += `<path d="M62 166C72 146 128 146 138 166L150 196C130 208 70 208 50 196Z" fill="${ac}" opacity=".95"/><path d="M62 170q38 -16 76 0" stroke="${ol}" stroke-width="2" fill="none" opacity=".5"/><path d="M100 188V240" stroke="${od}" stroke-width="2.4"/>`; break;
      default: // suit
        body += `<path d="M86 162L100 210L114 162Z" fill="${shirtW}"/><path d="M84 162L100 210L76 234L52 190Z" fill="${ol}"/><path d="M116 162L100 210L124 234L148 190Z" fill="${ol}"/><path d="M86 160l14 14-13 5z M114 160l-14 14 13 5z" fill="#fff"/>`;
    }
    // ---- 配饰（身体层）
    let accBody = '';
    if (acc.includes('tie')) accBody += `<path d="M95 170h10l-2 9h-6z" fill="${ac}"/><path d="M96 179h8l6 44-10 8-10-8z" fill="${ac}"/><path d="M96 179h8l6 44-10 8z" fill="#000" opacity=".12"/>`;
    if (acc.includes('bow')) accBody += `<path d="M100 172L84 164V180Z M100 172L116 164V180Z" fill="${ac}"/><circle cx="100" cy="172" r="3.4" fill="${darken(ac, .75)}"/>`;
    if (acc.includes('scarf')) accBody += `<path d="M78 156C90 174 110 174 122 156L132 184C114 196 86 196 68 184Z" fill="${ac}"/><path d="M76 170C90 182 110 182 126 170M72 180C88 192 112 192 130 180" stroke="#fff" stroke-width="2" fill="none" opacity=".35"/><path d="M110 178l8 40 14-4-6-34z" fill="${darken(ac, .85)}"/>`;
    if (acc.includes('necklace')) accBody += `<path d="M84 166Q100 190 116 166" stroke="#d4af37" stroke-width="1.8" fill="none"/><circle cx="100" cy="184" r="3.6" fill="#d4af37"/><circle cx="100" cy="184" r="1.4" fill="${ac}"/>`;
    if (acc.includes('badge')) accBody += `<rect x="124" y="190" width="26" height="16" rx="2" fill="#f4f1e8" stroke="#8a8a8a"/><rect x="127" y="193" width="9" height="9" fill="#9aa6bb"/><path d="M138 196h9M138 200h7" stroke="#555" stroke-width="1.6"/>`;
    if (acc.includes('stethoscope')) accBody += `<path d="M80 168C70 202 90 218 100 212C110 218 130 202 120 168" stroke="#4b535d" stroke-width="3.2" fill="none" stroke-linecap="round"/><circle cx="100" cy="214" r="6.5" fill="#b8c0c9" stroke="#4b535d" stroke-width="2"/>`;
    if (acc.includes('pocketwatch')) accBody += `<path d="M112 200q-12 8-22 0" stroke="#d4af37" stroke-width="1.6" fill="none"/><circle cx="90" cy="202" r="4" fill="#d4af37"/>`;
    if (acc.includes('flower')) accBody += `<g transform="translate(130 196)"><circle r="4" fill="${ac}"/><circle cx="-4" cy="-3" r="3" fill="${ac}"/><circle cx="4" cy="-3" r="3" fill="${ac}"/><circle r="1.6" fill="#f5d76e"/></g>`;
    // ---- 头部
    const neck = `<path d="M86 134h28v32c-8 7-20 7-28 0z" fill="${sk2}"/><ellipse cx="100" cy="150" rx="24" ry="9" fill="#000" opacity=".16"/>`;
    const ears = `<ellipse cx="${f ? 64 : 62}" cy="99" rx="5.5" ry="10" fill="${sk2}"/><ellipse cx="${f ? 136 : 138}" cy="99" rx="5.5" ry="10" fill="${sk2}"/>`;
    const headP = `<path d="${head}" fill="url(#sk${u})"/>`;
    const lid = mood.lid || 0;
    const eye = (x) => `<ellipse cx="${x}" cy="97" rx="${f ? 6.2 : 6}" ry="${(f ? 4.2 : 3.9) - lid}" fill="#f6f1e8"/><circle cx="${x}" cy="97.4" r="${mood.pr || 3}" fill="${look.skin === 'deep' ? '#241812' : '#3a2a20'}"/><circle cx="${x}" cy="97.4" r="${(mood.pr || 3) * 0.47}" fill="#0a0806"/><circle cx="${x + 1.2}" cy="96.2" r=".9" fill="#fff"/><path d="M${x - 6.5} ${96 - lid * 0.6}Q${x} ${92.5 - lid}, ${x + 6.5} ${96 - lid * 0.6}" stroke="#2a1c14" stroke-width="${f ? 2 : 1.7}" fill="none" stroke-linecap="round"/>${f ? `<path d="M${x - 6.6} 95.4l-2-1.6M${x + 6.6} 95.4l2-1.6" stroke="#2a1c14" stroke-width="1.2" stroke-linecap="round"/>` : ''}`;
    const bo = Object.assign({ y: 85, arch: 3, tilt: 0, w: f ? 2.4 : 3.2, lr: 0 }, mood.b);
    const bc = darken(hc === L_HAIR.white || hc === L_HAIR.silver ? '#d8dae0' : hc, 1);
    const brows = `<path d="M72 ${bo.y + bo.tilt - bo.lr}Q83 ${bo.y - bo.arch - bo.lr} 94 ${bo.y - bo.tilt - bo.lr + 1}" stroke="${bc}" stroke-width="${bo.w}" fill="none" stroke-linecap="round"/><path d="M106 ${bo.y - bo.tilt + 1}Q117 ${bo.y - bo.arch} 128 ${bo.y + bo.tilt}" stroke="${bc}" stroke-width="${bo.w}" fill="none" stroke-linecap="round"/>`;
    const nose = `<path d="M100 98Q95 112 93 114Q100 118 107 114" stroke="${sk2}" stroke-width="1.8" fill="none" stroke-linecap="round" opacity=".7"/><ellipse cx="100" cy="116" rx="9" ry="3" fill="${sk2}" opacity=".12"/>`;
    const mouth = f ? `<path d="${mood.m}" stroke="#b23a48" stroke-width="3.2" fill="none" stroke-linecap="round"/>` : `<path d="${mood.m}" stroke="#7a4636" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
    const cheeks = `<ellipse cx="76" cy="112" rx="9" ry="6" fill="#e07a6a" opacity="${f ? .2 : .1}"/><ellipse cx="124" cy="112" rx="9" ry="6" fill="#e07a6a" opacity="${f ? .2 : .1}"/>`;
    let wr = '';
    if (age >= 48) wr += `<path d="M72 70Q100 62 128 70" stroke="${sk2}" stroke-width="1.2" fill="none" opacity=".4"/><path d="M70 104q3 4 4 8M130 104q-3 4-4 8" stroke="${sk2}" stroke-width="1.2" fill="none" opacity=".5"/>`;
    if (age >= 60) wr += `<path d="M74 76Q100 70 126 76M90 118q-4 6-2 12M110 118q4 6 2 12" stroke="${sk2}" stroke-width="1.2" fill="none" opacity=".45"/>`;
    if (mood.bags) wr += `<ellipse cx="84" cy="103" rx="8" ry="2.4" fill="#7a5a8a" opacity=".28"/><ellipse cx="116" cy="103" rx="8" ry="2.4" fill="#7a5a8a" opacity=".28"/>`;
    // 胡须
    const r = rng(11); let bd = '';
    const bcol = darken(hc, hc === L_HAIR.white || hc === L_HAIR.silver || hc === L_HAIR.grey ? 1.0 : .8);
    const stub = () => `<g fill="${darken(hc, .9)}" opacity=".35">${Array.from({ length: 46 }, () => { const a = r() * Math.PI, rr = 30 + r() * 12; return `<circle cx="${(100 + Math.cos(a) * rr * .95).toFixed(1)}" cy="${(112 + Math.sin(a) * rr * .58).toFixed(1)}" r=".85"/>`; }).join('')}</g>`;
    const must = `<path d="M84 119Q100 111 116 119Q109 126 100 122Q91 126 84 119Z" fill="${bcol}"/>`;
    if (look.beard === 'stubble') bd = stub();
    else if (look.beard === 'mustache') bd = must;
    else if (look.beard === 'goatee') bd = must + `<path d="M92 134Q100 150 108 134Q100 138 92 134Z" fill="${bcol}"/>`;
    else if (look.beard === 'full') bd = `<path d="M64 106C62 132 78 152 100 154C122 152 138 132 136 106C132 122 120 130 100 130C80 130 68 122 64 106Z" fill="${bcol}"/>` + must;
    // 眼镜
    let gl = '';
    if (look.glasses === 'round') gl = `<g fill="rgba(180,210,230,.16)" stroke="#2f343b" stroke-width="2"><circle cx="84" cy="97" r="12.5"/><circle cx="116" cy="97" r="12.5"/></g><path d="M96.5 95Q100 92 103.5 95M71.5 95L62 93M128.5 95L138 93" stroke="#2f343b" stroke-width="1.8" fill="none"/>`;
    else if (look.glasses === 'rect') gl = `<g fill="rgba(190,215,255,.14)" stroke="#d4af37" stroke-width="1.8"><rect x="72" y="87" width="23" height="16" rx="4"/><rect x="105" y="87" width="23" height="16" rx="4"/></g><path d="M95 93h10M72 92l-10 2M128 92l10 2" stroke="#d4af37" stroke-width="1.6" fill="none"/>`;
    else if (look.glasses === 'sun') gl = `<g fill="#0b0d12" stroke="#222" stroke-width="1.8"><rect x="71" y="88" width="25" height="16" rx="6"/><rect x="104" y="88" width="25" height="16" rx="6"/></g><path d="M96 94h8M71 92l-9 2M129 92l9 2" stroke="#222" stroke-width="2" fill="none"/><path d="M76 91l8 3" stroke="#fff" stroke-width="1.2" opacity=".4"/>`;
    // 配饰（头部层）
    let accHead = '';
    if (acc.includes('earrings')) accHead += `<circle cx="${f ? 64 : 62}" cy="110" r="3.2" fill="#f4f0ea"/><circle cx="${f ? 136 : 138}" cy="110" r="3.2" fill="#f4f0ea"/>`;
    if (acc.includes('headset')) accHead += `<path d="M62 94C58 50 142 50 138 94" stroke="#2a2d35" stroke-width="4" fill="none"/><rect x="55" y="88" width="10" height="20" rx="4" fill="#2a2d35"/><rect x="135" y="88" width="10" height="20" rx="4" fill="#2a2d35"/><path d="M58 108Q64 128 86 130" stroke="#2a2d35" stroke-width="2.4" fill="none"/><circle cx="88" cy="130" r="3" fill="#2a2d35"/>`;
    const finish = `<rect width="200" height="240" fill="url(#rim${u})"/><rect width="200" height="240" fill="url(#vg${u})"/>`;
    const pale = mood.pale ? `<path d="${head}" fill="#cfe0ff" opacity=".18"/>` : '';
    const mfx = mood.fx ? MOOD_FX[mood.fx] || '' : '';
    return defs + backdrop + back + hoodBack + neck + body + neckCover + accBody + ears + headP + pale + wr + brows + eye(84) + eye(116) + nose + cheeks + mouth + bd + mfx + front + gl + accHead + finish;
  }

  function portraitFromLook(look, o = {}) {
    if (o.mood && MOODS[o.mood]) look = Object.assign({}, look, { mood: o.mood });
    const ck = 'L|' + JSON.stringify(look) + '|' + (o.crop || '') + '|' + (o.cls || '') + '|' + (o.age || '');
    if (cache.has(ck)) return cache.get(ck);
    const u = ++uid;
    const vb = o.crop === 'face' ? '40 30 120 120' : '0 0 200 240';
    const r = `<svg class="portrait p-look ${o.cls || ''}" viewBox="${vb}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${o.label || ''}">${lookInner(look, o.age || 40, u)}</svg>`;
    cache.set(ck, r); return r;
  }

  // 时间线小图标
  const ICONS = {
    key: '<circle cx="9" cy="12" r="5"/><path d="M13 12h9M19 12v4M22 12v3"/>',
    glass: '<path d="M7 3h10l-1 8a4 4 0 0 1-8 0zM12 15v6M8 21h8"/>',
    door: '<path d="M6 21V4h12v17M3 21h18"/><circle cx="15" cy="13" r="1"/>',
    pill: '<rect x="3" y="9" width="18" height="7" rx="3.5" transform="rotate(-35 12 12)"/><path d="M9 14l5-5" />',
    cam: '<rect x="3" y="7" width="13" height="10" rx="2"/><path d="M16 11l5-3v8l-5-3M3 3l18 18"/>',
    skull: '<path d="M12 3a8 8 0 0 0-5 14v3h10v-3a8 8 0 0 0-5-14zM9 12h.01M15 12h.01M10 17v3M14 17v3"/>',
    siren: '<path d="M6 19v-6a6 6 0 0 1 12 0v6M4 19h16M12 3v2M4 7l1.5 1.5M20 7l-1.5 1.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    phone: '<path d="M6 3h4l2 5-2.5 1.5a11 11 0 0 0 5 5L16 12l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z"/>',
    wave: '<path d="M2 12c3-4 5 4 8 0s5 4 8 0 3-2 4-1M2 18c3-4 5 4 8 0s5 4 8 0 3-2 4-1"/>',
    fire: '<path d="M12 3c1 4 5 6 5 11a5 5 0 0 1-10 0c0-3 2-4 2-7 2 1 3 3 3 4 1-2 1-5 0-8z"/>',
    mask: '<path d="M4 6c5 2 11 2 16 0v6c0 5-4 8-8 8s-8-3-8-8zM8 11h2M14 11h2M9 15q3 2 6 0"/>',
    book: '<path d="M4 5c3-1 6-1 8 1 2-2 5-2 8-1v13c-3-1-6-1-8 1-2-2-5-2-8-1z M12 6v13"/>',
    anchor: '<circle cx="12" cy="5" r="2"/><path d="M12 7v14M6 12H4a8 8 0 0 0 16 0h-2M8 11h8"/>',
    snow: '<path d="M12 2v20M4 7l16 10M4 17L20 7M9 4l3 2 3-2M9 20l3-2 3 2"/>'
  };
  const icon = (n) => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ''}</svg>`;

  return { portrait, scene, sceneFor, icon, SCENES };
})();
if (typeof window !== 'undefined') window.ART = ART;
