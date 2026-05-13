export type Lang = "fr" | "en";

export const TOOLTIP_TEXTS = {
    fr: {
        sidebar_ident_mode: "Basculer entre la saisie manuelle d’un nom et la recherche dans la base DN.",
        sidebar_time_ref: "Basculer la référence horaire entre heure officielle et temps universel.",
        sidebar_coords_toggle: "Basculer l’affichage des coordonnées entre format décimal et format degrés/minutes/secondes.",
        sidebar_transit_panel_toggle: "Afficher ou replier les options du panneau Transits.",
        sidebar_reset: "Réinitialiser les champs de saisie et revenir à l’état par défaut.",
        sidebar_compute: "Calculer le thème et mettre à jour les vues de l’onglet actif.",
        sidebar_export: "Exporter l’onglet courant au format image, document ou données selon le contexte.",
        sidebar_language: "Choisir la langue de l’interface et des textes affichés.",
        sidebar_date: "Saisir la date utilisée pour calculer le thème astrologique.",
        sidebar_time: "Saisir l’heure utilisée pour calculer le thème astrologique.",
        sidebar_city: "Rechercher une ville pour remplir automatiquement la localisation et le fuseau horaire.",
        sidebar_latlon: "Saisir ou afficher les coordonnées géographiques utilisées pour le calcul du thème.",
        sidebar_name: "Saisir un nom ou un libellé pour identifier ce thème. Champ facultatif.",
        detail_copy: "Copier le contenu du panneau Détails dans le presse-papiers.",
        transit_date: "Saisir la date utilisée pour calculer les positions de transit.",
        transit_aspect_mode: "Choisir si les aspects affichés comparent les transits au thème natal, ou les transits entre eux.",

        tab_ecliptic: "Écliptique — afficher le thème écliptique principal.",
        tab_domitude: "Domitude — afficher le thème de domitude.",
        tab_ret: "RET / HP — afficher le retour et la hiérarchie planétaire.",
        tab_transits: "Transits — afficher les transits pour la date choisie.",
        tab_aspects: "Aspects — afficher les aspects planétaires sous forme de tableau graphique.",
        tab_interpretation: "Interprétation — afficher le texte d’interprétation du thème.",

        nav_prev: "Onglet précédent.",
        nav_next: "Onglet suivant.",
    },

    en: {
        sidebar_ident_mode: "Switch between manual name entry and DN database search.",
        sidebar_time_ref: "Toggle the time reference between local time and universal time.",
        sidebar_coords_toggle: "Toggle coordinate display between decimal format and degrees/minutes/seconds.",
        sidebar_transit_panel_toggle: "Expand or collapse the Transits panel options.",
        sidebar_reset: "Reset the input fields and return to the default state.",
        sidebar_compute: "Compute the chart and refresh the views of the active tab.",
        sidebar_export: "Export the current tab as an image, document, or data depending on context.",
        sidebar_language: "Choose the interface language and the displayed texts.",
        sidebar_date: "Enter the date used to compute the astrological chart.",
        sidebar_time: "Enter the time used to compute the astrological chart.",
        sidebar_city: "Search for a city to automatically fill the location and time zone.",
        sidebar_latlon: "Enter or display the geographic coordinates used to compute the chart.",
        sidebar_name: "Enter a name or label to identify this chart. Optional field.",
        detail_copy: "Copy the Details panel content to the clipboard.",
        transit_date: "Enter the date used to compute the transit positions.",
        transit_aspect_mode: "Choose whether the displayed aspects compare transits to the natal chart, or transits with one another.",

        tab_ecliptic: "Ecliptic — display the main ecliptic chart.",
        tab_domitude: "Domitude — display the domitude chart.",
        tab_ret: "RET / HP — display RET and planetary hierarchy.",
        tab_transits: "Transits — display transits for the selected date.",
        tab_aspects: "Aspects — display planetary aspects as a graphical table.",
        tab_interpretation: "Interpretation — display the chart interpretation text.",

        nav_prev: "Previous tab.",
        nav_next: "Next tab.",
    },
} as const;

export type TooltipKey = keyof typeof TOOLTIP_TEXTS.fr;

export function getTooltipText(key: TooltipKey, lang: Lang): string {
    return TOOLTIP_TEXTS[lang]?.[key] ?? TOOLTIP_TEXTS.fr[key] ?? "";
}