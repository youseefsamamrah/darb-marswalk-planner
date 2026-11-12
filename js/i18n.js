/*
 * i18n.js — English / Arabic text for the interface.
 * Any HTML element with data-i18n="key" gets its text from here.
 * To add a language: copy the "en" block and translate the values.
 */
var DARB_TEXT = {
  en: {
    title: "Darb", subtitle: "Marswalk Planner · Mount Sharp, Gale Crater",
    langBtn: "عربي", hudBtn: "HUD mode", hudExit: "Exit HUD",
    layersTitle: "Data layers", layerSlope: "Terrain slope (MOLA)", layerThermal: "Thermal inertia proxy (THEMIS night IR)",
    layerMinerals: "Minerals (CRISM)", layerMola: "Elevation hillshade (MOLA)", layerRover: "Curiosity traverse + 2025 stops",
    legendSlope: "Slope: green < 10° · yellow < 15° · orange < 20° · red = blocked",
    legendThermal: "Bright = warm at night = rock · Dark = cold = loose sand/dust",
    routeTitle: "Route planner", routeHelp: "Click the map: 1st click = START, 2nd click = GOAL.",
    demoBtn: "Demo: rover site sol 4300 → boxwork (sol 4660)", clearBtn: "Clear",
    "why.o2-exceeded": "round trip is LONGER than the O₂ budget — do not go", buddyLabel: "Buddy mode (2 astronauts, max gap m):",
    simulateBtn: "Simulate walk",
    distance: "Distance", timeOut: "Walk time (one way)", roundTrip: "Round trip", o2: "O₂ reserve after return",
    gain: "Climb / descent", maxSlope: "Max slope", sand: "Loose sand on route", dose: "Radiation dose (EVA)",
    safe: "🟢 Safe", caution: "🟡 Caution", danger: "🔴 Danger",
    "why.slope>10": "some slopes over 10°", "why.slope>15": "slopes over 15°",
    "why.o2-reserve<50%": "less than 50% O₂ reserve", "why.o2-reserve<25%": "less than 25% O₂ reserve",
    "why.sand>20%": "over 20% loose sand",
    "err.outside": "That point is outside the mapped data area (dashed box).",
    "err.same-cell": "Start and goal are the same spot — pick a different goal.",
    "err.start-blocked": "Start is on ground too steep to walk (> 20°) or too narrow for buddy mode.",
    "err.goal-blocked": "Goal is on ground too steep to walk (> 20°) or too narrow for buddy mode.",
    "err.no-path": "No safe route exists between these points.",
    envTitle: "Weather & radiation", envSol: "Latest REMS sol", envAir: "Air temp", envGround: "Ground temp",
    envPressure: "Pressure", envUV: "UV index", envSky: "Sky", envSun: "Sunrise / sunset", envRad: "Surface radiation (RAD)",
    askTitle: "Ask Darb (offline AI)", askPlaceholder: "Ask about your route, minerals, a photo…",
    askSend: "Ask", askOffline: "Ask Darb is offline — start Ollama to use it (the map still works).",
    askOnline: "Running locally on this device", askThinking: "Thinking locally…",
    q1: "Is this route safe?", q2: "What minerals are near waypoint 3?", q3: "Explain the rock photo at waypoint 6",
    hover: "Move over the map to read the data", wpLook: "What to look for",
    wpText: "Boxwork: criss-crossing ridges about 1–2 m tall with sandy hollows between them. Groundwater once left minerals in fractures; those parts resisted wind erosion (NASA/JPL, 2026). Look for a thin central fracture along ridge tops, layered sulfate-rich bedrock, and loose sand in the hollows.",
    lightDelay: "Earth is 4–24 light-minutes away: Darb's AI runs on this device.",
    sampleNote: "No SAMPLE DATA is used: every layer comes from NASA data (see SOURCES.md)."
  },
  ar: {
    title: "دَرْب", subtitle: "مخطط المشي على المريخ · جبل شارب، فوهة غيل",
    langBtn: "English", hudBtn: "وضع الخوذة", hudExit: "خروج من الخوذة",
    layersTitle: "طبقات البيانات", layerSlope: "انحدار التضاريس (MOLA)", layerThermal: "القصور الحراري (THEMIS ليلي)",
    layerMinerals: "المعادن (CRISM)", layerMola: "تظليل الارتفاع (MOLA)", layerRover: "مسار كيوريوسيتي ومحطات 2025",
    legendSlope: "الانحدار: أخضر < 10° · أصفر < 15° · برتقالي < 20° · أحمر = مغلق",
    legendThermal: "فاتح = دافئ ليلاً = صخر · داكن = بارد = رمل مفكك",
    routeTitle: "مخطط المسار", routeHelp: "انقر على الخريطة: النقرة الأولى = البداية، الثانية = الهدف.",
    demoBtn: "عرض: موقع المسبار يوم 4300 ← الصناديق (يوم 4660)", clearBtn: "مسح",
    "why.o2-exceeded": "الذهاب والعودة أطول من ميزانية الأكسجين — لا تذهب", buddyLabel: "وضع الرفيق (رائدان، أقصى مسافة م):",
    simulateBtn: "محاكاة المشي",
    distance: "المسافة", timeOut: "زمن المشي (ذهاب)", roundTrip: "ذهاب وعودة", o2: "احتياطي الأكسجين بعد العودة",
    gain: "صعود / نزول", maxSlope: "أقصى انحدار", sand: "رمل مفكك على المسار", dose: "جرعة الإشعاع (النشاط)",
    safe: "🟢 آمن", caution: "🟡 حذر", danger: "🔴 خطر",
    "why.slope>10": "انحدارات فوق 10°", "why.slope>15": "انحدارات فوق 15°",
    "why.o2-reserve<50%": "احتياطي أكسجين أقل من 50%", "why.o2-reserve<25%": "احتياطي أكسجين أقل من 25%",
    "why.sand>20%": "أكثر من 20% رمل مفكك",
    "err.outside": "هذه النقطة خارج منطقة البيانات (المربع المتقطع).",
    "err.same-cell": "البداية والهدف نفس المكان — اختر هدفاً آخر.",
    "err.start-blocked": "البداية على أرض شديدة الانحدار (> 20°) أو ضيقة لوضع الرفيق.",
    "err.goal-blocked": "الهدف على أرض شديدة الانحدار (> 20°) أو ضيقة لوضع الرفيق.",
    "err.no-path": "لا يوجد مسار آمن بين هاتين النقطتين.",
    envTitle: "الطقس والإشعاع", envSol: "آخر يوم مريخي (REMS)", envAir: "حرارة الهواء", envGround: "حرارة الأرض",
    envPressure: "الضغط", envUV: "الأشعة فوق البنفسجية", envSky: "السماء", envSun: "الشروق / الغروب", envRad: "إشعاع السطح (RAD)",
    askTitle: "اسأل دَرْب (ذكاء اصطناعي محلي)", askPlaceholder: "اسأل عن مسارك أو المعادن أو صورة…",
    askSend: "اسأل", askOffline: "اسأل دَرْب غير متصل — شغّل Ollama لاستخدامه (الخريطة تعمل).",
    askOnline: "يعمل محلياً على هذا الجهاز", askThinking: "يفكر محلياً…",
    q1: "هل هذا المسار آمن؟", q2: "ما المعادن قرب المحطة 3؟", q3: "اشرح صورة الصخور في المحطة 6",
    hover: "مرّر فوق الخريطة لقراءة البيانات", wpLook: "ماذا تبحث عنه",
    wpText: "الصناديق: حواف متقاطعة بارتفاع 1–2 م تقريباً بينها تجاويف رملية. ترسبت معادن من المياه الجوفية في الشقوق فقاومت تعرية الرياح (ناسا/JPL، 2026). ابحث عن شق رفيع في قمة الحافة، وصخور طبقية غنية بالكبريتات، ورمل مفكك في التجاويف.",
    lightDelay: "الأرض على بعد 4–24 دقيقة ضوئية: ذكاء دَرْب يعمل على هذا الجهاز.",
    sampleNote: "لا توجد بيانات تجريبية: كل الطبقات من بيانات ناسا (انظر SOURCES.md)."
  }
};

var DarbI18n = {
  lang: "en",
  t: function (key) {
    var d = DARB_TEXT[this.lang];
    return (d && d[key] !== undefined) ? d[key] : (DARB_TEXT.en[key] !== undefined ? DARB_TEXT.en[key] : key);
  },
  // Update every element that has data-i18n / data-i18n-placeholder
  apply: function () {
    var self = this;
    document.documentElement.lang = this.lang;
    document.documentElement.dir = this.lang === "ar" ? "rtl" : "ltr";
    document.querySelectorAll("[data-i18n]").forEach(function (el) { el.textContent = self.t(el.dataset.i18n); });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) { el.placeholder = self.t(el.dataset.i18nPlaceholder); });
  }
};
