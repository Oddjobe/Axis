export type Language = "en" | "fr" | "sw" | "pt";

export const translations: Record<Language, Record<string, string>> = {
    en: {
        dashboard_title: "Axis Africa",
        subtitle: "AFRICAN X-RAY INTELLIGENCE SYSTEM · V1.0",
        population: "POPULATION",
        selected_population: "SELECTED POPULATION",
        about: "ABOUT",
        sovereignty: "SOVEREIGNTY",
        outside_influence: "OUTSIDE INFLUENCE",
        live: "LIVE",
        index: "INDEX",
        map: "MAP",
        intel: "INTEL",
        filtering: "FILTERING:"
    },
    fr: {
        dashboard_title: "Axe Afrique",
        subtitle: "SYSTÈME D'INTELLIGENCE ET DE RADIOGRAPHIE AFRICAIN · V1.0",
        population: "POPULATION",
        selected_population: "POPULATION SÉLECTIONNÉE",
        about: "À PROPOS",
        sovereignty: "SOUVERAINETÉ",
        outside_influence: "INFLUENCE EXTERNE",
        live: "EN DIRECT",
        index: "INDICE",
        map: "CARTE",
        intel: "RENSEIGN.",
        filtering: "FILTRAGE:"
    },
    sw: {
        dashboard_title: "Mhimili Afrika",
        subtitle: "MFUMO WA INTELIJENSIA WA X-RAY WA AFRIKA · V1.0",
        population: "IDADI YA WATU",
        selected_population: "WATU WALIOCHAGULIWA",
        about: "KUHUSU",
        sovereignty: "MAMLAKA",
        outside_influence: "ATHARI ZA NJE",
        live: "MOJA KWA MOJA",
        index: "FAHIRISI",
        map: "RAMANI",
        intel: "INTEL",
        filtering: "KUCHUJA:"
    },
    pt: {
        dashboard_title: "Eixo África",
        subtitle: "SISTEMA DE INTELIGÊNCIA E RAIO-X AFRICANO · V1.0",
        population: "POPULAÇÃO",
        selected_population: "POPULAÇÃO SELECIONADA",
        about: "SOBRE",
        sovereignty: "SOBERANIA",
        outside_influence: "INFLUÊNCIA EXTERNA",
        live: "AO VIVO",
        index: "ÍNDICE",
        map: "MAPA",
        intel: "INTEL",
        filtering: "FILTRANDO:"
    }
};

export const useTranslation = (lang: Language) => {
    return (key: string) => translations[lang][key] || key;
};
