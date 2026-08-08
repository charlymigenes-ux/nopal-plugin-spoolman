(() => {
    const PLUGIN_ID = 'spoolman';
    if (window.NopalPluginRegistry?.[PLUGIN_ID]) return;

    const state = {
        config: null,
        spools: [],
        printers: [],
        links: {},
        reservations: [],
        quotes: [],
        summary: null,
        alerts: [],
        consumption: {},
        activeTab: 'resumen',
        viewMode: 'grid',
        search: '',
        materialFilter: 'all',
        statusFilter: 'all',
        loading: false,
        alertsExpanded: false,
        // null = todavía no se buscó en esta sesión; [] = se buscó y no
        // apareció nada; distinguir estos dos casos evita relanzar el
        // escaneo de red en cada visita a la sección si ya no encontró nada.
        discovering: false,
        discovered: null,
        // Mini-cotizador de la barra lateral: cálculo local (precio real
        // del spool elegido, sin pasar por un archivo real de Cotizador)
        // -- es una previsualización de costo, no una cotización guardada.
        miniQuoteSpoolId: null,
        miniQuoteWeightG: '',
        miniQuoteWastePercent: 10,
        detailSpoolId: null,
    };

    let root = null;

    const icon = (body, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
    const ICON_SPOOL = '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>';
    const ICON_SCALE = '<path d="M12 3v18"/><path d="M5 8h14"/><path d="m3 8 2.5 5a2.5 2.5 0 0 0 5 0L8 8"/><path d="m16 8 2.5 5a2.5 2.5 0 0 0 5 0L21 8"/>';
    const ICON_ALERT = '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>';
    const ICON_LOCK = '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>';
    const ICON_CHART = '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>';
    const ICON_SETTINGS = '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>';
    const ICON_GRID = '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>';
    const ICON_LIST = '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>';
    const ICON_TRASH = '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 10v6M14 10v6"/>';
    const ICON_REFRESH = '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>';

    // Mismo patrón que font-library.js/svg-toolkit.js (plugins/font-library,
    // plugins/svg-toolkit): diccionario propio por plugin, sin un t()/i18n
    // global del core (no existe uno expuesto a plugins) -- lee el idioma
    // que el usuario ya eligió en Configuración (localStorage.language).
    const I18N = {
        es: {
            statusLow: 'Bajo', statusReserved: 'Reservado', statusAssigned: 'Asignado', statusAvailable: 'Disponible', availableShort: 'disp.',
            networkError: 'Error de red', connectedToSpoolman: 'Conectado con Spoolman', couldNotConnect: 'No se pudo conectar con Spoolman',
            tileActiveSpools: 'Bobinas activas', tileInInventory: 'en inventario', tileAvailable: 'Disponible', tileReadyToUse: 'listo para usar',
            tileLowStock: 'Bajo inventario', tileNeedAttention: 'requieren atención', tileReserved: 'Reservado', tileForProduction: 'para producción',
            tileMonthConsumption: 'Consumo del mes', tileThisMonth: 'este mes',
            tabSummary: 'Resumen', tabFilaments: 'Filamentos', tabSpools: 'Spools', tabReservations: 'Reservas', tabConsumption: 'Consumo',
            remainingSuffix: 'restantes', noLocation: 'Sin ubicación', viewDetail: 'Ver detalle',
            spoolDetailTitle: 'Detalle del spool', spoolNoLongerAvailable: 'Este spool ya no está disponible.',
            remainingLabel: 'Restante', costLabel: 'Costo', locationLabel: 'Ubicación', lotLabel: 'Lote',
            assignedPrinterLabel: 'Impresora asignada', printerFallback: 'Impresora', unassigned: 'Sin asignar', noteLabel: 'Nota',
            activeReservationsLabel: 'Reservas activas', noReservationsForSpool: 'Sin reservas para este spool.',
            searchSpoolPlaceholder: 'Buscar spool...', materialAll: 'Material: Todos', statusAllOpt: 'Estado: Todos',
            noSpoolsMatchFilter: 'No hay spools que coincidan con el filtro.',
            colId: 'ID', colFilament: 'Filamento', colVendor: 'Fabricante', colRemaining: 'Restante', colLocation: 'Ubicación', colPricePerGram: '$/g', colStatus: 'Estado',
            newReservation: 'Nueva reserva', orderQuote: 'Pedido / cotización', chooseOption: '— elegir —',
            noQuotesHint: 'No hay cotizaciones del Cotizador para vincular (¿está instalado ese plugin?). Podés reservar igual con una etiqueta libre.',
            orderLabel: 'Etiqueta del pedido', orderLabelPlaceholder: 'Ej. Pedido #1274 — Caja ESP32', spoolFieldLabel: 'Spool',
            gramsLabel: 'Gramos', scheduledForLabel: 'Fecha programada (opcional)', noteOptionalLabel: 'Nota (opcional)',
            reserveBtn: 'Reservar', noActiveReservations: 'Sin reservas activas.',
            consumptionThisMonth: 'Consumo de este mes por material',
            noConsumptionYet: 'Todavía no hay consumo registrado este mes. Se va llenando con el uso real que reporte Spoolman.',
            summaryHint: 'Usá las pestañas de arriba para ver el detalle de Filamentos, Spools, Reservas y Consumo. El panel de la derecha resume el estado de tus impresoras y las alertas activas.',
            noSpoolAssigned: 'Sin spool asignado',
            miniQuoteTitle: 'Cotizador NOPAL', selectedMaterial: 'Material seleccionado', noSpoolsOption: 'Sin spools',
            costPerGramLabel: 'Costo/g', estimatedWeightG: 'Peso estimado (g)', wastePercent: 'Desperdicio (%)', totalMaterial: 'Total material',
            monthlyConsumption: 'Consumo mensual', noConsumptionThisMonth: 'Sin consumo este mes.', totalLabel: 'Total',
            alertsTitle: 'Alertas', noActiveAlerts: 'Sin alertas activas.', showLess: 'Ver menos', showAllAlerts: 'Ver todas las alertas',
            goToSpoolman: 'Ir a Spoolman',
            printersAndAssignedSpool: 'Impresoras y spool asignado', noKlipperPrintersDetected: 'No se detectaron impresoras Klipper.',
            reservationsForProduction: 'Reservas para producción', noReservations: 'Sin reservas.',
            hostIpLabel: 'Host / IP', portLabel: 'Puerto', connectBtn: 'Conectar',
            searchingSpoolman: 'Buscando Spoolman en tu red...', noSpoolmanFoundOnNetwork: 'No se encontró ningún Spoolman en tu red local.',
            searchAgain: 'Buscar de nuevo', foundServers: 'Encontramos {count} servidor(es) Spoolman:',
            thisSameServer: 'Este mismo servidor', onYourLocalNetwork: 'En tu red local',
            connectYourSpoolmanServer: 'Conectá tu servidor Spoolman',
            spoolmanIntro: 'NOPAL va a leer tu inventario real de spools desde ahí -- no se duplica ni se inventa nada.',
            configureConnectionManually: 'Configurar conexión manualmente',
            materialsTitle: 'Materiales', filamentsInventorySub: 'Inventario de filamentos e insumos',
            spoolmanConnected: '· Conectado', spoolmanDisconnected: '· Desconectado', configureConnectionTitle: 'Configurar conexión',
            spoolmanSettingsTitle: 'Configuración de Spoolman', disconnectBtn: 'Desconectar',
            footerNote: 'Inventario físico gestionado por Spoolman · Reservas, cotización y producción gestionadas por NOPAL',
            reservationCreated: 'Reserva creada', couldNotCreateReservation: 'No se pudo crear la reserva',
            confirmReleaseReservation: '¿Liberar esta reserva?', deleteReservationTitle: 'Eliminar reserva',
            reservationDeleted: 'Reserva eliminada', couldNotDeleteReservation: 'No se pudo eliminar la reserva',
            spoolAssigned: 'Spool asignado', spoolUnassigned: 'Spool desasignado', couldNotUpdateAssignment: 'No se pudo actualizar la asignación',
            confirmDisconnectSpoolman: '¿Desconectar Spoolman? Se pierde la configuración guardada (no el inventario, que sigue viviendo en Spoolman).',
            refreshTitle: 'Actualizar',
        },
        en: {
            statusLow: 'Low', statusReserved: 'Reserved', statusAssigned: 'Assigned', statusAvailable: 'Available', availableShort: 'avail.',
            networkError: 'Network error', connectedToSpoolman: 'Connected to Spoolman', couldNotConnect: 'Could not connect to Spoolman',
            tileActiveSpools: 'Active spools', tileInInventory: 'in inventory', tileAvailable: 'Available', tileReadyToUse: 'ready to use',
            tileLowStock: 'Low stock', tileNeedAttention: 'need attention', tileReserved: 'Reserved', tileForProduction: 'for production',
            tileMonthConsumption: 'Month consumption', tileThisMonth: 'this month',
            tabSummary: 'Summary', tabFilaments: 'Filaments', tabSpools: 'Spools', tabReservations: 'Reservations', tabConsumption: 'Consumption',
            remainingSuffix: 'remaining', noLocation: 'No location', viewDetail: 'View detail',
            spoolDetailTitle: 'Spool detail', spoolNoLongerAvailable: 'This spool is no longer available.',
            remainingLabel: 'Remaining', costLabel: 'Cost', locationLabel: 'Location', lotLabel: 'Lot',
            assignedPrinterLabel: 'Assigned printer', printerFallback: 'Printer', unassigned: 'Unassigned', noteLabel: 'Note',
            activeReservationsLabel: 'Active reservations', noReservationsForSpool: 'No reservations for this spool.',
            searchSpoolPlaceholder: 'Search spool...', materialAll: 'Material: All', statusAllOpt: 'Status: All',
            noSpoolsMatchFilter: 'No spools match the filter.',
            colId: 'ID', colFilament: 'Filament', colVendor: 'Vendor', colRemaining: 'Remaining', colLocation: 'Location', colPricePerGram: '$/g', colStatus: 'Status',
            newReservation: 'New reservation', orderQuote: 'Order / quote', chooseOption: '— choose —',
            noQuotesHint: 'No quotes from the Quoter to link (is that plugin installed?). You can still reserve with a free-text label.',
            orderLabel: 'Order label', orderLabelPlaceholder: 'E.g. Order #1274 — ESP32 case', spoolFieldLabel: 'Spool',
            gramsLabel: 'Grams', scheduledForLabel: 'Scheduled date (optional)', noteOptionalLabel: 'Note (optional)',
            reserveBtn: 'Reserve', noActiveReservations: 'No active reservations.',
            consumptionThisMonth: "This month's consumption by material",
            noConsumptionYet: 'No consumption recorded this month yet. It fills in as Spoolman reports real usage.',
            summaryHint: 'Use the tabs above to see the detail for Filaments, Spools, Reservations, and Consumption. The panel on the right summarizes your printers and active alerts.',
            noSpoolAssigned: 'No spool assigned',
            miniQuoteTitle: 'NOPAL Quoter', selectedMaterial: 'Selected material', noSpoolsOption: 'No spools',
            costPerGramLabel: 'Cost/g', estimatedWeightG: 'Estimated weight (g)', wastePercent: 'Waste (%)', totalMaterial: 'Total material',
            monthlyConsumption: 'Monthly consumption', noConsumptionThisMonth: 'No consumption this month.', totalLabel: 'Total',
            alertsTitle: 'Alerts', noActiveAlerts: 'No active alerts.', showLess: 'Show less', showAllAlerts: 'Show all alerts',
            goToSpoolman: 'Go to Spoolman',
            printersAndAssignedSpool: 'Printers and assigned spool', noKlipperPrintersDetected: 'No Klipper printers detected.',
            reservationsForProduction: 'Reservations for production', noReservations: 'No reservations.',
            hostIpLabel: 'Host / IP', portLabel: 'Port', connectBtn: 'Connect',
            searchingSpoolman: 'Searching for Spoolman on your network...', noSpoolmanFoundOnNetwork: 'No Spoolman found on your local network.',
            searchAgain: 'Search again', foundServers: 'Found {count} Spoolman server(s):',
            thisSameServer: 'This same server', onYourLocalNetwork: 'On your local network',
            connectYourSpoolmanServer: 'Connect your Spoolman server',
            spoolmanIntro: "NOPAL will read your real spool inventory from there -- nothing is duplicated or made up.",
            configureConnectionManually: 'Configure connection manually',
            materialsTitle: 'Materials', filamentsInventorySub: 'Filament and supplies inventory',
            spoolmanConnected: '· Connected', spoolmanDisconnected: '· Disconnected', configureConnectionTitle: 'Configure connection',
            spoolmanSettingsTitle: 'Spoolman settings', disconnectBtn: 'Disconnect',
            footerNote: 'Physical inventory managed by Spoolman · Reservations, quoting, and production managed by NOPAL',
            reservationCreated: 'Reservation created', couldNotCreateReservation: 'Could not create the reservation',
            confirmReleaseReservation: 'Release this reservation?', deleteReservationTitle: 'Delete reservation',
            reservationDeleted: 'Reservation deleted', couldNotDeleteReservation: 'Could not delete the reservation',
            spoolAssigned: 'Spool assigned', spoolUnassigned: 'Spool unassigned', couldNotUpdateAssignment: 'Could not update the assignment',
            confirmDisconnectSpoolman: 'Disconnect Spoolman? The saved configuration is lost (not the inventory, which still lives in Spoolman).',
            refreshTitle: 'Refresh',
        },
        de: {
            statusLow: 'Niedrig', statusReserved: 'Reserviert', statusAssigned: 'Zugewiesen', statusAvailable: 'Verfügbar', availableShort: 'verf.',
            networkError: 'Netzwerkfehler', connectedToSpoolman: 'Mit Spoolman verbunden', couldNotConnect: 'Verbindung zu Spoolman fehlgeschlagen',
            tileActiveSpools: 'Aktive Spulen', tileInInventory: 'im Bestand', tileAvailable: 'Verfügbar', tileReadyToUse: 'einsatzbereit',
            tileLowStock: 'Niedriger Bestand', tileNeedAttention: 'benötigen Aufmerksamkeit', tileReserved: 'Reserviert', tileForProduction: 'für Produktion',
            tileMonthConsumption: 'Verbrauch des Monats', tileThisMonth: 'diesen Monat',
            tabSummary: 'Übersicht', tabFilaments: 'Filamente', tabSpools: 'Spulen', tabReservations: 'Reservierungen', tabConsumption: 'Verbrauch',
            remainingSuffix: 'übrig', noLocation: 'Kein Standort', viewDetail: 'Details ansehen',
            spoolDetailTitle: 'Spulendetail', spoolNoLongerAvailable: 'Diese Spule ist nicht mehr verfügbar.',
            remainingLabel: 'Verbleibend', costLabel: 'Kosten', locationLabel: 'Standort', lotLabel: 'Charge',
            assignedPrinterLabel: 'Zugewiesener Drucker', printerFallback: 'Drucker', unassigned: 'Nicht zugewiesen', noteLabel: 'Notiz',
            activeReservationsLabel: 'Aktive Reservierungen', noReservationsForSpool: 'Keine Reservierungen für diese Spule.',
            searchSpoolPlaceholder: 'Spule suchen...', materialAll: 'Material: Alle', statusAllOpt: 'Status: Alle',
            noSpoolsMatchFilter: 'Keine Spulen entsprechen dem Filter.',
            colId: 'ID', colFilament: 'Filament', colVendor: 'Hersteller', colRemaining: 'Verbleibend', colLocation: 'Standort', colPricePerGram: '$/g', colStatus: 'Status',
            newReservation: 'Neue Reservierung', orderQuote: 'Auftrag / Angebot', chooseOption: '— auswählen —',
            noQuotesHint: 'Keine Angebote vom Kalkulator zum Verknüpfen (ist das Plugin installiert?). Du kannst trotzdem mit einer freien Bezeichnung reservieren.',
            orderLabel: 'Auftragsbezeichnung', orderLabelPlaceholder: 'z. B. Auftrag #1274 — ESP32-Gehäuse', spoolFieldLabel: 'Spule',
            gramsLabel: 'Gramm', scheduledForLabel: 'Geplantes Datum (optional)', noteOptionalLabel: 'Notiz (optional)',
            reserveBtn: 'Reservieren', noActiveReservations: 'Keine aktiven Reservierungen.',
            consumptionThisMonth: 'Verbrauch dieses Monats nach Material',
            noConsumptionYet: 'Für diesen Monat ist noch kein Verbrauch erfasst. Er füllt sich mit der von Spoolman gemeldeten tatsächlichen Nutzung.',
            summaryHint: 'Nutze die Tabs oben, um Details zu Filamenten, Spulen, Reservierungen und Verbrauch zu sehen. Das Panel rechts fasst den Status deiner Drucker und aktive Warnungen zusammen.',
            noSpoolAssigned: 'Keine Spule zugewiesen',
            miniQuoteTitle: 'NOPAL-Kalkulator', selectedMaterial: 'Ausgewähltes Material', noSpoolsOption: 'Keine Spulen',
            costPerGramLabel: 'Kosten/g', estimatedWeightG: 'Geschätztes Gewicht (g)', wastePercent: 'Verschnitt (%)', totalMaterial: 'Material gesamt',
            monthlyConsumption: 'Monatlicher Verbrauch', noConsumptionThisMonth: 'Kein Verbrauch diesen Monat.', totalLabel: 'Gesamt',
            alertsTitle: 'Warnungen', noActiveAlerts: 'Keine aktiven Warnungen.', showLess: 'Weniger anzeigen', showAllAlerts: 'Alle Warnungen anzeigen',
            goToSpoolman: 'Zu Spoolman',
            printersAndAssignedSpool: 'Drucker und zugewiesene Spule', noKlipperPrintersDetected: 'Keine Klipper-Drucker erkannt.',
            reservationsForProduction: 'Reservierungen für Produktion', noReservations: 'Keine Reservierungen.',
            hostIpLabel: 'Host / IP', portLabel: 'Port', connectBtn: 'Verbinden',
            searchingSpoolman: 'Suche nach Spoolman in deinem Netzwerk...', noSpoolmanFoundOnNetwork: 'Kein Spoolman in deinem lokalen Netzwerk gefunden.',
            searchAgain: 'Erneut suchen', foundServers: '{count} Spoolman-Server gefunden:',
            thisSameServer: 'Dieser Server selbst', onYourLocalNetwork: 'In deinem lokalen Netzwerk',
            connectYourSpoolmanServer: 'Verbinde deinen Spoolman-Server',
            spoolmanIntro: 'NOPAL liest deinen echten Spulenbestand von dort -- nichts wird dupliziert oder erfunden.',
            configureConnectionManually: 'Verbindung manuell konfigurieren',
            materialsTitle: 'Materialien', filamentsInventorySub: 'Filament- und Materialbestand',
            spoolmanConnected: '· Verbunden', spoolmanDisconnected: '· Getrennt', configureConnectionTitle: 'Verbindung konfigurieren',
            spoolmanSettingsTitle: 'Spoolman-Einstellungen', disconnectBtn: 'Trennen',
            footerNote: 'Physischer Bestand verwaltet von Spoolman · Reservierungen, Angebote und Produktion verwaltet von NOPAL',
            reservationCreated: 'Reservierung erstellt', couldNotCreateReservation: 'Reservierung konnte nicht erstellt werden',
            confirmReleaseReservation: 'Diese Reservierung freigeben?', deleteReservationTitle: 'Reservierung löschen',
            reservationDeleted: 'Reservierung gelöscht', couldNotDeleteReservation: 'Reservierung konnte nicht gelöscht werden',
            spoolAssigned: 'Spule zugewiesen', spoolUnassigned: 'Spule nicht mehr zugewiesen', couldNotUpdateAssignment: 'Zuweisung konnte nicht aktualisiert werden',
            confirmDisconnectSpoolman: 'Spoolman trennen? Die gespeicherte Konfiguration geht verloren (nicht der Bestand, der weiterhin in Spoolman lebt).',
            refreshTitle: 'Aktualisieren',
        },
        fr: {
            statusLow: 'Faible', statusReserved: 'Réservée', statusAssigned: 'Assignée', statusAvailable: 'Disponible', availableShort: 'disp.',
            networkError: 'Erreur réseau', connectedToSpoolman: 'Connecté à Spoolman', couldNotConnect: 'Impossible de se connecter à Spoolman',
            tileActiveSpools: 'Bobines actives', tileInInventory: 'en stock', tileAvailable: 'Disponible', tileReadyToUse: 'prêt à l\'emploi',
            tileLowStock: 'Stock faible', tileNeedAttention: 'nécessitent une attention', tileReserved: 'Réservé', tileForProduction: 'pour la production',
            tileMonthConsumption: 'Consommation du mois', tileThisMonth: 'ce mois-ci',
            tabSummary: 'Résumé', tabFilaments: 'Filaments', tabSpools: 'Bobines', tabReservations: 'Réservations', tabConsumption: 'Consommation',
            remainingSuffix: 'restants', noLocation: 'Sans emplacement', viewDetail: 'Voir le détail',
            spoolDetailTitle: 'Détail de la bobine', spoolNoLongerAvailable: "Cette bobine n'est plus disponible.",
            remainingLabel: 'Restant', costLabel: 'Coût', locationLabel: 'Emplacement', lotLabel: 'Lot',
            assignedPrinterLabel: 'Imprimante assignée', printerFallback: 'Imprimante', unassigned: 'Non assignée', noteLabel: 'Note',
            activeReservationsLabel: 'Réservations actives', noReservationsForSpool: 'Aucune réservation pour cette bobine.',
            searchSpoolPlaceholder: 'Rechercher une bobine...', materialAll: 'Matériau : Tous', statusAllOpt: 'Statut : Tous',
            noSpoolsMatchFilter: 'Aucune bobine ne correspond au filtre.',
            colId: 'ID', colFilament: 'Filament', colVendor: 'Fabricant', colRemaining: 'Restant', colLocation: 'Emplacement', colPricePerGram: '$/g', colStatus: 'Statut',
            newReservation: 'Nouvelle réservation', orderQuote: 'Commande / devis', chooseOption: '— choisir —',
            noQuotesHint: "Aucun devis du Chiffrage à lier (ce plugin est-il installé ?). Vous pouvez quand même réserver avec une étiquette libre.",
            orderLabel: 'Étiquette de la commande', orderLabelPlaceholder: 'Ex. Commande #1274 — Boîtier ESP32', spoolFieldLabel: 'Bobine',
            gramsLabel: 'Grammes', scheduledForLabel: 'Date prévue (optionnel)', noteOptionalLabel: 'Note (optionnel)',
            reserveBtn: 'Réserver', noActiveReservations: 'Aucune réservation active.',
            consumptionThisMonth: 'Consommation de ce mois par matériau',
            noConsumptionYet: "Aucune consommation enregistrée ce mois-ci pour l'instant. Elle se remplit au fur et à mesure que Spoolman rapporte l'usage réel.",
            summaryHint: "Utilisez les onglets ci-dessus pour voir le détail des Filaments, Bobines, Réservations et Consommation. Le panneau de droite résume l'état de vos imprimantes et les alertes actives.",
            noSpoolAssigned: 'Aucune bobine assignée',
            miniQuoteTitle: 'Chiffrage NOPAL', selectedMaterial: 'Matériau sélectionné', noSpoolsOption: 'Aucune bobine',
            costPerGramLabel: 'Coût/g', estimatedWeightG: 'Poids estimé (g)', wastePercent: 'Perte (%)', totalMaterial: 'Total matériau',
            monthlyConsumption: 'Consommation mensuelle', noConsumptionThisMonth: 'Aucune consommation ce mois-ci.', totalLabel: 'Total',
            alertsTitle: 'Alertes', noActiveAlerts: 'Aucune alerte active.', showLess: 'Voir moins', showAllAlerts: 'Voir toutes les alertes',
            goToSpoolman: 'Aller à Spoolman',
            printersAndAssignedSpool: 'Imprimantes et bobine assignée', noKlipperPrintersDetected: 'Aucune imprimante Klipper détectée.',
            reservationsForProduction: 'Réservations pour la production', noReservations: 'Aucune réservation.',
            hostIpLabel: 'Hôte / IP', portLabel: 'Port', connectBtn: 'Connecter',
            searchingSpoolman: 'Recherche de Spoolman sur votre réseau...', noSpoolmanFoundOnNetwork: 'Aucun Spoolman trouvé sur votre réseau local.',
            searchAgain: 'Rechercher à nouveau', foundServers: '{count} serveur(s) Spoolman trouvé(s) :',
            thisSameServer: 'Ce même serveur', onYourLocalNetwork: 'Sur votre réseau local',
            connectYourSpoolmanServer: 'Connectez votre serveur Spoolman',
            spoolmanIntro: "NOPAL va lire votre inventaire réel de bobines depuis là-bas -- rien n'est dupliqué ni inventé.",
            configureConnectionManually: 'Configurer la connexion manuellement',
            materialsTitle: 'Matériaux', filamentsInventorySub: 'Inventaire des filaments et fournitures',
            spoolmanConnected: '· Connecté', spoolmanDisconnected: '· Déconnecté', configureConnectionTitle: 'Configurer la connexion',
            spoolmanSettingsTitle: 'Paramètres Spoolman', disconnectBtn: 'Déconnecter',
            footerNote: "Inventaire physique géré par Spoolman · Réservations, devis et production gérés par NOPAL",
            reservationCreated: 'Réservation créée', couldNotCreateReservation: 'Impossible de créer la réservation',
            confirmReleaseReservation: 'Libérer cette réservation ?', deleteReservationTitle: 'Supprimer la réservation',
            reservationDeleted: 'Réservation supprimée', couldNotDeleteReservation: 'Impossible de supprimer la réservation',
            spoolAssigned: 'Bobine assignée', spoolUnassigned: 'Bobine désassignée', couldNotUpdateAssignment: "Impossible de mettre à jour l'assignation",
            confirmDisconnectSpoolman: "Déconnecter Spoolman ? La configuration enregistrée est perdue (pas l'inventaire, qui reste dans Spoolman).",
            refreshTitle: 'Actualiser',
        },
        'pt-BR': {
            statusLow: 'Baixo', statusReserved: 'Reservado', statusAssigned: 'Atribuído', statusAvailable: 'Disponível', availableShort: 'disp.',
            networkError: 'Erro de rede', connectedToSpoolman: 'Conectado ao Spoolman', couldNotConnect: 'Não foi possível conectar ao Spoolman',
            tileActiveSpools: 'Bobinas ativas', tileInInventory: 'no estoque', tileAvailable: 'Disponível', tileReadyToUse: 'pronto para uso',
            tileLowStock: 'Estoque baixo', tileNeedAttention: 'precisam de atenção', tileReserved: 'Reservado', tileForProduction: 'para produção',
            tileMonthConsumption: 'Consumo do mês', tileThisMonth: 'este mês',
            tabSummary: 'Resumo', tabFilaments: 'Filamentos', tabSpools: 'Bobinas', tabReservations: 'Reservas', tabConsumption: 'Consumo',
            remainingSuffix: 'restantes', noLocation: 'Sem localização', viewDetail: 'Ver detalhe',
            spoolDetailTitle: 'Detalhe da bobina', spoolNoLongerAvailable: 'Esta bobina não está mais disponível.',
            remainingLabel: 'Restante', costLabel: 'Custo', locationLabel: 'Localização', lotLabel: 'Lote',
            assignedPrinterLabel: 'Impressora atribuída', printerFallback: 'Impressora', unassigned: 'Não atribuído', noteLabel: 'Nota',
            activeReservationsLabel: 'Reservas ativas', noReservationsForSpool: 'Sem reservas para esta bobina.',
            searchSpoolPlaceholder: 'Buscar bobina...', materialAll: 'Material: Todos', statusAllOpt: 'Status: Todos',
            noSpoolsMatchFilter: 'Nenhuma bobina corresponde ao filtro.',
            colId: 'ID', colFilament: 'Filamento', colVendor: 'Fabricante', colRemaining: 'Restante', colLocation: 'Localização', colPricePerGram: '$/g', colStatus: 'Status',
            newReservation: 'Nova reserva', orderQuote: 'Pedido / orçamento', chooseOption: '— escolher —',
            noQuotesHint: 'Não há orçamentos do Orçamento para vincular (esse plugin está instalado?). Você ainda pode reservar com uma etiqueta livre.',
            orderLabel: 'Etiqueta do pedido', orderLabelPlaceholder: 'Ex. Pedido #1274 — Caixa ESP32', spoolFieldLabel: 'Bobina',
            gramsLabel: 'Gramas', scheduledForLabel: 'Data programada (opcional)', noteOptionalLabel: 'Nota (opcional)',
            reserveBtn: 'Reservar', noActiveReservations: 'Sem reservas ativas.',
            consumptionThisMonth: 'Consumo deste mês por material',
            noConsumptionYet: 'Ainda não há consumo registrado este mês. Ele vai se preenchendo com o uso real relatado pelo Spoolman.',
            summaryHint: 'Use as abas acima para ver o detalhe de Filamentos, Bobinas, Reservas e Consumo. O painel à direita resume o status das suas impressoras e os alertas ativos.',
            noSpoolAssigned: 'Sem bobina atribuída',
            miniQuoteTitle: 'Orçamento NOPAL', selectedMaterial: 'Material selecionado', noSpoolsOption: 'Sem bobinas',
            costPerGramLabel: 'Custo/g', estimatedWeightG: 'Peso estimado (g)', wastePercent: 'Desperdício (%)', totalMaterial: 'Total do material',
            monthlyConsumption: 'Consumo mensal', noConsumptionThisMonth: 'Sem consumo este mês.', totalLabel: 'Total',
            alertsTitle: 'Alertas', noActiveAlerts: 'Sem alertas ativos.', showLess: 'Ver menos', showAllAlerts: 'Ver todos os alertas',
            goToSpoolman: 'Ir para o Spoolman',
            printersAndAssignedSpool: 'Impressoras e bobina atribuída', noKlipperPrintersDetected: 'Nenhuma impressora Klipper detectada.',
            reservationsForProduction: 'Reservas para produção', noReservations: 'Sem reservas.',
            hostIpLabel: 'Host / IP', portLabel: 'Porta', connectBtn: 'Conectar',
            searchingSpoolman: 'Procurando Spoolman na sua rede...', noSpoolmanFoundOnNetwork: 'Nenhum Spoolman encontrado na sua rede local.',
            searchAgain: 'Buscar novamente', foundServers: 'Encontramos {count} servidor(es) Spoolman:',
            thisSameServer: 'Este mesmo servidor', onYourLocalNetwork: 'Na sua rede local',
            connectYourSpoolmanServer: 'Conecte seu servidor Spoolman',
            spoolmanIntro: 'O NOPAL vai ler seu inventário real de bobinas de lá -- nada é duplicado ou inventado.',
            configureConnectionManually: 'Configurar conexão manualmente',
            materialsTitle: 'Materiais', filamentsInventorySub: 'Inventário de filamentos e insumos',
            spoolmanConnected: '· Conectado', spoolmanDisconnected: '· Desconectado', configureConnectionTitle: 'Configurar conexão',
            spoolmanSettingsTitle: 'Configuração do Spoolman', disconnectBtn: 'Desconectar',
            footerNote: 'Inventário físico gerenciado pelo Spoolman · Reservas, orçamento e produção gerenciados pelo NOPAL',
            reservationCreated: 'Reserva criada', couldNotCreateReservation: 'Não foi possível criar a reserva',
            confirmReleaseReservation: 'Liberar esta reserva?', deleteReservationTitle: 'Excluir reserva',
            reservationDeleted: 'Reserva excluída', couldNotDeleteReservation: 'Não foi possível excluir a reserva',
            spoolAssigned: 'Bobina atribuída', spoolUnassigned: 'Bobina desatribuída', couldNotUpdateAssignment: 'Não foi possível atualizar a atribuição',
            confirmDisconnectSpoolman: 'Desconectar o Spoolman? A configuração salva é perdida (não o inventário, que continua no Spoolman).',
            refreshTitle: 'Atualizar',
        },
    };

    function lang() {
        const raw = document.documentElement.lang || localStorage.getItem('language') || 'es';
        if (raw.toLowerCase().startsWith('pt')) return 'pt-BR';
        const short = raw.slice(0, 2).toLowerCase();
        return ['es', 'en', 'de', 'fr'].includes(short) ? short : 'en';
    }

    function tr(key, vars) {
        let text = I18N[lang()]?.[key] || I18N.en[key] || key;
        if (vars) Object.entries(vars).forEach(([name, value]) => { text = text.replace(`{${name}}`, value); });
        return text;
    }

    const esc = value => typeof window.escapeHtml === 'function' ? window.escapeHtml(value) : String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const toast = (message, tone = 'success') => typeof window.showToast === 'function' ? window.showToast(message, tone) : console.log(message);
    const alertDialog = (message, title = '') => typeof window.appAlert === 'function' ? window.appAlert(message, title, 'danger') : window.alert(message);
    const confirmDialog = (message, title = '') => typeof window.appConfirm === 'function' ? window.appConfirm(message, title, 'danger') : Promise.resolve(window.confirm(message));

    async function api(url, options = {}) {
        const response = await fetch(url, options);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.detail || tr('networkError'));
        return data;
    }

    function fmtWeight(grams) {
        const value = Number(grams) || 0;
        return value >= 1000 ? `${(value / 1000).toFixed(2)} kg` : `${Math.round(value)} g`;
    }

    function fmtMoney(value) {
        return `$${(Number(value) || 0).toFixed(2)}`;
    }

    function spoolLabel(spool) {
        const filament = spool.filament || {};
        const parts = [filament.material, filament.name].filter(Boolean);
        return parts.length ? parts.join(' • ') : `Spool #${spool.id}`;
    }

    function spoolColor(spool) {
        const filament = spool.filament || {};
        const hex = filament.color_hex || (filament.multi_color_hexes || '').split(',')[0];
        return hex ? `#${hex.replace(/^#/, '')}` : 'var(--text-muted)';
    }

    function spoolStatus(spool) {
        const threshold = state.config?.low_stock_threshold_g ?? 250;
        const remaining = spool.remaining_weight ?? 0;
        const linkedPort = Object.entries(state.links).find(([, link]) => link.spool_id === spool.id)?.[0];
        if (remaining < threshold) return { key: 'low', label: tr('statusLow') };
        if ((spool.reserved_weight || 0) >= remaining && spool.reserved_weight > 0) return { key: 'reserved', label: tr('statusReserved') };
        if (linkedPort) return { key: 'assigned', label: tr('statusAssigned') };
        return { key: 'available', label: tr('statusAvailable') };
    }

    // ── Carga de datos ──

    async function loadConfig() {
        state.config = await api('/api/spoolman/config').catch(() => null);
    }

    async function loadDashboardData() {
        const [spoolsRes, linksRes, reservationsRes, summaryRes, alertsRes, consumptionRes, printersRes] = await Promise.all([
            api('/api/spoolman/spools').catch(() => ({ spools: [] })),
            api('/api/spoolman/printers/active-spools').catch(() => ({ links: {} })),
            api('/api/spoolman/reservations').catch(() => ({ reservations: [] })),
            api('/api/spoolman/summary').catch(() => null),
            api('/api/spoolman/alerts').catch(() => ({ alerts: [] })),
            api('/api/spoolman/consumption/monthly').catch(() => ({ by_material: {} })),
            api('/api/printers/status').catch(() => ({ printers: [] })),
        ]);
        state.spools = spoolsRes.spools || [];
        state.links = linksRes.links || {};
        state.reservations = reservationsRes.reservations || [];
        state.summary = summaryRes;
        state.alerts = alertsRes.alerts || [];
        state.consumption = consumptionRes.by_material || {};
        state.printers = printersRes.printers || [];
        // Cotizador es opcional -- si no está instalado, /api/pricing/quotes
        // no existe y esto falla en silencio (Reservas simplemente no puede
        // sugerir pedidos, no rompe el resto del plugin).
        state.quotes = (await api('/api/pricing/quotes').catch(() => ({ quotes: [] }))).quotes || [];
    }

    async function refreshAll() {
        state.loading = true;
        render();
        await loadConfig();
        if (state.config?.configured) {
            try {
                await loadDashboardData();
            } catch (error) {
                console.error(error);
            }
        } else if (state.discovered === null && !state.discovering) {
            discoverSpoolman();
        }
        state.loading = false;
        render();
    }

    // Barrido de localhost + red local buscando servidores Spoolman reales
    // -- corre aparte del flujo de refreshAll (no se espera) para no
    // demorar el primer render de la pantalla "no configurado" mientras
    // dura el escaneo (~1-2s).
    async function discoverSpoolman() {
        state.discovering = true;
        render();
        try {
            const data = await api('/api/spoolman/discover');
            state.discovered = data.instances || [];
        } catch (error) {
            console.error(error);
            state.discovered = [];
        }
        state.discovering = false;
        render();
    }

    async function connectToDiscovered(host, port) {
        const formData = new FormData();
        formData.append('host', host);
        formData.append('port', port);
        try {
            await api('/api/spoolman/config', { method: 'POST', body: formData });
            toast(tr('connectedToSpoolman'));
            await refreshAll();
        } catch (error) {
            alertDialog(error.message || tr('couldNotConnect'));
        }
    }

    // ── Render ──

    function statTile(iconSvg, label, value, sub, colorKey) {
        return `
            <div class="spm-tile">
                <div class="spm-tile-icon spm-tile-icon-${colorKey}">${iconSvg}</div>
                <div class="spm-tile-body">
                    <span class="spm-tile-value">${esc(value)}</span>
                    <span class="spm-tile-label">${esc(label)}</span>
                    ${sub ? `<span class="spm-tile-sub">${esc(sub)}</span>` : ''}
                </div>
            </div>`;
    }

    function renderStatTiles() {
        const summary = state.summary || { active_spools: 0, available_kg: 0, low_stock_count: 0, reserved_kg: 0, consumption_month_kg: 0 };
        return `
            <div class="spm-tiles">
                ${statTile(icon(ICON_SPOOL, 22), tr('tileActiveSpools'), summary.active_spools, tr('tileInInventory'), 'green')}
                ${statTile(icon(ICON_SCALE, 22), tr('tileAvailable'), `${summary.available_kg} kg`, tr('tileReadyToUse'), 'blue')}
                ${statTile(icon(ICON_ALERT, 22), tr('tileLowStock'), summary.low_stock_count, tr('tileNeedAttention'), 'orange')}
                ${statTile(icon(ICON_LOCK, 22), tr('tileReserved'), `${summary.reserved_kg} kg`, tr('tileForProduction'), 'purple')}
                ${statTile(icon(ICON_CHART, 22), tr('tileMonthConsumption'), `${summary.consumption_month_kg} kg`, tr('tileThisMonth'), 'blue')}
            </div>`;
    }

    function renderTabs() {
        const tabs = [['resumen', tr('tabSummary')], ['filamentos', tr('tabFilaments')], ['spools', tr('tabSpools')], ['reservas', tr('tabReservations')], ['consumo', tr('tabConsumption')]];
        return `
            <div class="spm-tabs">
                ${tabs.map(([key, label]) => `<button type="button" class="spm-tab${state.activeTab === key ? ' active' : ''}" data-spm-tab="${key}">${esc(label)}</button>`).join('')}
            </div>`;
    }

    function filteredSpools() {
        return state.spools.filter(spool => {
            const filament = spool.filament || {};
            if (state.materialFilter !== 'all' && (filament.material || '') !== state.materialFilter) return false;
            if (state.statusFilter !== 'all' && spoolStatus(spool).key !== state.statusFilter) return false;
            if (state.search) {
                const haystack = `${filament.material || ''} ${filament.name || ''} ${(filament.vendor || {}).name || ''} ${spool.location || ''} #${spool.id}`.toLowerCase();
                if (!haystack.includes(state.search.toLowerCase())) return false;
            }
            return true;
        });
    }

    function spoolCard(spool) {
        const status = spoolStatus(spool);
        const filament = spool.filament || {};
        const remaining = spool.remaining_weight ?? 0;
        const price = spool.price || filament.price;
        const weightG = spool.initial_weight || filament.weight;
        const perGram = price && weightG ? price / weightG : null;
        return `
            <div class="spm-spool-card">
                <div class="spm-spool-card-top">
                    <span class="spm-spool-id">#${spool.id}</span>
                    <span class="spm-badge spm-badge-${status.key}">${esc(status.label)}</span>
                    <span class="spm-color-dot" style="background:${spoolColor(spool)}"></span>
                </div>
                <div class="spm-spool-name">${esc(spoolLabel(spool))}</div>
                <div class="spm-spool-vendor">${esc((filament.vendor || {}).name || '')}</div>
                <div class="spm-spool-weight">${esc(fmtWeight(remaining))} ${tr('remainingSuffix')}</div>
                <div class="spm-spool-location">${esc(spool.location || tr('noLocation'))}</div>
                <div class="spm-spool-card-bottom">
                    ${perGram ? `<span class="spm-spool-price">${fmtMoney(perGram)} / g</span>` : '<span></span>'}
                    <button type="button" class="spm-icon-btn spm-spool-detail-btn" data-spm-open-spool-detail="${spool.id}" title="${tr('viewDetail')}">${icon(ICON_GRID, 16)}</button>
                </div>
            </div>`;
    }

    function renderSpoolDetailDialog(spoolId) {
        const closeBtn = `<button type="button" data-spm-close-spool-detail>${icon('<path d="M18 6 6 18M6 6l12 12"/>', 16)}</button>`;
        const spool = state.spools.find(s => s.id === spoolId);
        if (!spool) {
            return `
                <div class="spm-panel-header"><strong>${tr('spoolDetailTitle')}</strong>${closeBtn}</div>
                <p class="spm-empty">${tr('spoolNoLongerAvailable')}</p>`;
        }
        const status = spoolStatus(spool);
        const filament = spool.filament || {};
        const remaining = spool.remaining_weight ?? 0;
        const initial = spool.initial_weight || filament.weight || 0;
        const percentLeft = initial ? Math.max(0, Math.min(100, Math.round((remaining / initial) * 100))) : 0;
        const price = spool.price || filament.price;
        const perGram = price && initial ? price / initial : null;
        const linkedPort = Object.entries(state.links).find(([, link]) => link.spool_id === spool.id)?.[0];
        const linkedPrinter = linkedPort ? state.printers.find(p => String(p.port) === linkedPort) : null;
        const spoolReservations = state.reservations.filter(r => r.spool_id === spool.id);
        return `
            <div class="spm-panel-header"><strong>#${spool.id} · ${esc(spoolLabel(spool))}</strong>${closeBtn}</div>
            <div class="spm-detail-top">
                <span class="spm-color-dot spm-detail-color-dot" style="background:${spoolColor(spool)}"></span>
                <div>
                    <div class="spm-spool-vendor">${esc((filament.vendor || {}).name || '')}</div>
                    <span class="spm-badge spm-badge-${status.key}">${esc(status.label)}</span>
                </div>
            </div>
            <div class="spm-detail-row"><span>${tr('remainingLabel')}</span><strong>${esc(fmtWeight(remaining))} / ${esc(fmtWeight(initial))}</strong></div>
            <div class="spm-consumo-bar-track"><div class="spm-consumo-bar-fill" style="width:${percentLeft}%;background:${materialColor(filament.material)}"></div></div>
            ${perGram ? `<div class="spm-detail-row"><span>${tr('costLabel')}</span><strong>${fmtMoney(perGram)} / g</strong></div>` : ''}
            <div class="spm-detail-row"><span>${tr('locationLabel')}</span><strong>${esc(spool.location || tr('noLocation'))}</strong></div>
            ${spool.lot_nr ? `<div class="spm-detail-row"><span>${tr('lotLabel')}</span><strong>${esc(spool.lot_nr)}</strong></div>` : ''}
            <div class="spm-detail-row"><span>${tr('assignedPrinterLabel')}</span><strong>${linkedPrinter ? esc(linkedPrinter.name || `${tr('printerFallback')} ${linkedPort}`) : tr('unassigned')}</strong></div>
            ${spool.comment ? `<div class="spm-detail-row"><span>${tr('noteLabel')}</span><strong>${esc(spool.comment)}</strong></div>` : ''}
            <div class="spm-detail-reservations">
                <h4>${tr('activeReservationsLabel')}</h4>
                ${spoolReservations.length ? spoolReservations.map(r => `
                    <div class="spm-mini-row">
                        <span class="spm-mini-row-label">${esc(r.quote_label)}</span>
                        <strong>${esc(fmtWeight(r.grams))}</strong>
                    </div>`).join('') : `<div class="spm-empty">${tr('noReservationsForSpool')}</div>`}
            </div>`;
    }

    function renderFilamentos() {
        const spools = filteredSpools();
        const materials = [...new Set(state.spools.map(s => (s.filament || {}).material).filter(Boolean))];
        return `
            <div class="spm-toolbar">
                <input type="search" class="spm-search" id="spm-search" placeholder="${tr('searchSpoolPlaceholder')}" value="${esc(state.search)}">
                <select class="spm-select" id="spm-material-filter">
                    <option value="all">${tr('materialAll')}</option>
                    ${materials.map(m => `<option value="${esc(m)}" ${state.materialFilter === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}
                </select>
                <select class="spm-select" id="spm-status-filter">
                    <option value="all">${tr('statusAllOpt')}</option>
                    <option value="available" ${state.statusFilter === 'available' ? 'selected' : ''}>${tr('statusAvailable')}</option>
                    <option value="assigned" ${state.statusFilter === 'assigned' ? 'selected' : ''}>${tr('statusAssigned')}</option>
                    <option value="reserved" ${state.statusFilter === 'reserved' ? 'selected' : ''}>${tr('statusReserved')}</option>
                    <option value="low" ${state.statusFilter === 'low' ? 'selected' : ''}>${tr('statusLow')}</option>
                </select>
                <div class="spm-view-switch">
                    <button type="button" class="spm-icon-btn${state.viewMode === 'grid' ? ' active' : ''}" data-spm-view="grid">${icon(ICON_GRID, 16)}</button>
                    <button type="button" class="spm-icon-btn${state.viewMode === 'list' ? ' active' : ''}" data-spm-view="list">${icon(ICON_LIST, 16)}</button>
                </div>
            </div>
            ${spools.length ? (state.viewMode === 'grid' ? `<div class="spm-spool-grid">${spools.map(spoolCard).join('')}</div>` : renderSpoolTable(spools)) : `<div class="spm-empty">${tr('noSpoolsMatchFilter')}</div>`}`;
    }

    function renderSpoolTable(spools) {
        return `
            <div class="spm-table-wrap">
                <table class="spm-table">
                    <thead><tr><th>${tr('colId')}</th><th>${tr('colFilament')}</th><th>${tr('colVendor')}</th><th>${tr('colRemaining')}</th><th>${tr('colLocation')}</th><th>${tr('colPricePerGram')}</th><th>${tr('colStatus')}</th></tr></thead>
                    <tbody>
                        ${spools.map(spool => {
                            const status = spoolStatus(spool);
                            const filament = spool.filament || {};
                            const price = spool.price || filament.price;
                            const weightG = spool.initial_weight || filament.weight;
                            const perGram = price && weightG ? price / weightG : null;
                            return `<tr>
                                <td>#${spool.id}</td>
                                <td><span class="spm-color-dot" style="background:${spoolColor(spool)}"></span> ${esc(spoolLabel(spool))}</td>
                                <td>${esc((filament.vendor || {}).name || '')}</td>
                                <td>${esc(fmtWeight(spool.remaining_weight ?? 0))}</td>
                                <td>${esc(spool.location || '—')}</td>
                                <td>${perGram ? fmtMoney(perGram) : '—'}</td>
                                <td><span class="spm-badge spm-badge-${status.key}">${esc(status.label)}</span></td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>`;
    }

    function renderReservas() {
        const spoolOptions = state.spools.map(s => `<option value="${s.id}">#${s.id} · ${esc(spoolLabel(s))} (${esc(fmtWeight(s.available_weight ?? s.remaining_weight ?? 0))} ${tr('availableShort')})</option>`).join('');
        const quoteOptions = state.quotes.map(q => `<option value="${esc(q.id)}" data-grams="${q.extracted?.filament_g || ''}" data-label="${esc(q.client_name ? `${q.client_name} — ${q.file?.name || ''}` : (q.file?.name || q.id))}">${esc(q.client_name ? `${q.client_name} — ${q.file?.name || ''}` : (q.file?.name || q.id))}</option>`).join('');
        return `
            <div class="spm-reservas-layout">
                <form class="spm-form" id="spm-reservation-form">
                    <h3>${tr('newReservation')}</h3>
                    ${state.quotes.length ? `<label>${tr('orderQuote')}<select name="quote_select" id="spm-quote-select"><option value="">${tr('chooseOption')}</option>${quoteOptions}</select></label>` : `<p class="spm-hint">${tr('noQuotesHint')}</p>`}
                    <label>${tr('orderLabel')}<input type="text" name="quote_label" id="spm-quote-label" placeholder="${tr('orderLabelPlaceholder')}" required></label>
                    <label>${tr('spoolFieldLabel')}<select name="spool_id" required><option value="">${tr('chooseOption')}</option>${spoolOptions}</select></label>
                    <label>${tr('gramsLabel')}<input type="number" name="grams" id="spm-reservation-grams" min="1" step="1" required></label>
                    <label>${tr('scheduledForLabel')}<input type="date" name="scheduled_for"></label>
                    <label>${tr('noteOptionalLabel')}<input type="text" name="note" maxlength="200"></label>
                    <button type="submit" class="spm-btn-accent">${tr('reserveBtn')}</button>
                </form>
                <div class="spm-reservas-list">
                    <h3>${tr('activeReservationsLabel')}</h3>
                    ${state.reservations.length ? state.reservations.map(r => `
                        <div class="spm-reserva-row">
                            <div class="spm-reserva-info">
                                <strong>${esc(r.quote_label)}</strong>
                                <span>#${r.spool_id} · ${esc(fmtWeight(r.grams))}${r.scheduled_for ? ` · ${esc(r.scheduled_for)}` : ''}</span>
                            </div>
                            <button type="button" class="spm-icon-btn spm-icon-btn-danger" data-spm-delete-reservation="${esc(r.id)}">${icon(ICON_TRASH, 14)}</button>
                        </div>`).join('') : `<div class="spm-empty">${tr('noActiveReservations')}</div>`}
                </div>
            </div>`;
    }

    // Paleta fija para los materiales más comunes (coincide con la
    // convención de color ya usada en el resto de NOPAL); cualquier
    // material fuera de esta lista cae en el accent del tema en vez de
    // inventar un color nuevo por material.
    const MATERIAL_COLORS = { PLA: 'var(--green)', PETG: '#3b82f6', ABS: '#ef4444', TPU: 'var(--purple, #a855f7)', ASA: '#06b6d4' };
    const materialColor = material => MATERIAL_COLORS[(material || '').toUpperCase()] || 'var(--spm-accent)';

    function renderConsumo() {
        const entries = Object.entries(state.consumption);
        const max = Math.max(1, ...entries.map(([, g]) => g));
        return `
            <div class="spm-consumo">
                <h3>${tr('consumptionThisMonth')}</h3>
                ${entries.length ? entries.map(([material, grams]) => `
                    <div class="spm-consumo-row">
                        <span class="spm-consumo-label">${esc(material)}</span>
                        <div class="spm-consumo-bar-track"><div class="spm-consumo-bar-fill" style="width:${Math.round((grams / max) * 100)}%;background:${materialColor(material)}"></div></div>
                        <span class="spm-consumo-value">${esc(fmtWeight(grams))}</span>
                    </div>`).join('') : `<div class="spm-empty">${tr('noConsumptionYet')}</div>`}
            </div>`;
    }

    function renderResumen() {
        return `
            <div class="spm-resumen">
                <p class="spm-hint">${tr('summaryHint')}</p>
                ${renderConsumo()}
            </div>`;
    }

    function renderTabContent() {
        switch (state.activeTab) {
            case 'filamentos': return renderFilamentos();
            case 'spools': return renderSpoolTable(filteredSpools());
            case 'reservas': return renderReservas();
            case 'consumo': return renderConsumo();
            default: return renderResumen();
        }
    }

    function renderPrinterRow(printer) {
        const link = state.links[String(printer.port)];
        const spool = link ? state.spools.find(s => s.id === link.spool_id) : null;
        const stateKey = printer.status === 'online' ? (printer.job?.state || 'ready') : 'offline';
        const options = state.spools.map(s => `<option value="${s.id}" ${link?.spool_id === s.id ? 'selected' : ''}>#${s.id} · ${esc(spoolLabel(s))}</option>`).join('');
        return `
            <div class="spm-printer-row">
                <span class="spm-printer-dot spm-printer-dot-${esc(stateKey)}"></span>
                <div class="spm-printer-info">
                    <strong>${esc(printer.name || `${tr('printerFallback')} ${printer.port}`)}</strong>
                    <span>${esc(stateKey)}</span>
                </div>
                ${spool ? `<span class="spm-color-dot spm-printer-spool-dot" style="background:${spoolColor(spool)}"></span>` : ''}
                <select class="spm-printer-spool-select" data-spm-printer-port="${printer.port}">
                    <option value="">${tr('noSpoolAssigned')}</option>
                    ${options}
                </select>
                ${spool ? `<span class="spm-printer-weight">${esc(fmtWeight(spool.remaining_weight ?? 0))}</span>` : ''}
            </div>`;
    }

    function miniQuoteSpoolOptions() {
        return state.spools.map(s => `<option value="${s.id}" ${state.miniQuoteSpoolId === s.id ? 'selected' : ''}>${esc(spoolLabel(s))} (${esc((s.filament || {}).vendor?.name || '')})</option>`).join('');
    }

    function computeMiniQuote() {
        const spool = state.spools.find(s => s.id === state.miniQuoteSpoolId) || state.spools[0] || null;
        const filament = spool?.filament || {};
        const price = spool ? (spool.price || filament.price) : null;
        const weightG = spool ? (spool.initial_weight || filament.weight) : null;
        const costPerGram = price && weightG ? price / weightG : null;
        const estimatedWeight = Number(state.miniQuoteWeightG) || 0;
        const wastePercent = Number(state.miniQuoteWastePercent) || 0;
        const materialWithWaste = estimatedWeight * (1 + wastePercent / 100);
        const totalCost = costPerGram != null ? costPerGram * materialWithWaste : null;
        return { costPerGram, totalCost };
    }

    // Recalcula y pisa solo el texto de los 2 resultados, sin tocar los
    // <input> -- si esto llamara a render() en cada tecleo, innerHTML
    // recrearía el campo de texto en cada letra y el foco/cursor se
    // perdería a mitad de escribir.
    function updateMiniQuoteTotals() {
        const { costPerGram, totalCost } = computeMiniQuote();
        const costEl = root.querySelector('#spm-mq-cost');
        const totalEl = root.querySelector('#spm-mq-total');
        if (costEl) costEl.textContent = costPerGram != null ? fmtMoney(costPerGram) : '—';
        if (totalEl) totalEl.textContent = totalCost != null ? fmtMoney(totalCost) : '—';
    }

    function renderMiniCotizador() {
        const { costPerGram, totalCost } = computeMiniQuote();
        return `
            <section class="spm-sidebar-card spm-mini-cotizador">
                <h3>${tr('miniQuoteTitle')}</h3>
                <label class="spm-mini-field">
                    <span>${tr('selectedMaterial')}</span>
                    <select id="spm-mq-spool">${miniQuoteSpoolOptions() || `<option value="">${tr('noSpoolsOption')}</option>`}</select>
                </label>
                <div class="spm-mini-stat"><span>${tr('costPerGramLabel')}</span><strong id="spm-mq-cost">${costPerGram != null ? fmtMoney(costPerGram) : '—'}</strong></div>
                <label class="spm-mini-field">
                    <span>${tr('estimatedWeightG')}</span>
                    <input type="number" id="spm-mq-weight" min="0" step="1" value="${esc(state.miniQuoteWeightG)}" placeholder="0">
                </label>
                <label class="spm-mini-field">
                    <span>${tr('wastePercent')}</span>
                    <input type="number" id="spm-mq-waste" min="0" max="100" step="1" value="${esc(state.miniQuoteWastePercent)}">
                </label>
                <div class="spm-mini-stat spm-mini-stat-total"><span>${tr('totalMaterial')}</span><strong id="spm-mq-total">${totalCost != null ? fmtMoney(totalCost) : '—'}</strong></div>
            </section>`;
    }

    function renderMiniConsumo() {
        const entries = Object.entries(state.consumption);
        const max = Math.max(1, ...entries.map(([, g]) => g));
        const totalKg = entries.reduce((sum, [, g]) => sum + g, 0) / 1000;
        return `
            <section class="spm-sidebar-card spm-mini-consumo">
                <h3>${tr('monthlyConsumption')}</h3>
                ${entries.length ? entries.map(([material, grams]) => `
                    <div class="spm-mini-consumo-row">
                        <span>${esc(material)}</span>
                        <div class="spm-consumo-bar-track"><div class="spm-consumo-bar-fill" style="width:${Math.round((grams / max) * 100)}%;background:${materialColor(material)}"></div></div>
                        <strong>${esc(fmtWeight(grams))}</strong>
                    </div>`).join('') : `<div class="spm-empty">${tr('noConsumptionThisMonth')}</div>`}
                <div class="spm-mini-consumo-total">${tr('totalLabel')}: ${totalKg.toFixed(1)} kg</div>
            </section>`;
    }

    function renderMiniAlertas() {
        const visible = state.alertsExpanded ? state.alerts : state.alerts.slice(0, 3);
        return `
            <section class="spm-sidebar-card spm-mini-alertas">
                <h3>${tr('alertsTitle')}</h3>
                ${visible.length ? visible.map(a => `
                    <div class="spm-alert-row spm-alert-${esc(a.severity)}">${icon(ICON_ALERT, 14)}<span>${esc(a.message)}</span></div>
                `).join('') : `<div class="spm-empty">${tr('noActiveAlerts')}</div>`}
                ${state.alerts.length > 3 ? `<button type="button" class="spm-mini-alertas-toggle" id="spm-toggle-alerts">${state.alertsExpanded ? tr('showLess') : tr('showAllAlerts')}</button>` : ''}
            </section>`;
    }

    function renderSpoolmanLinkCard() {
        const { host, port } = state.config || {};
        if (!host || !port) return '';
        // Si Spoolman se descubrió en el propio servidor, el host guardado
        // es 127.0.0.1/localhost -- eso solo resuelve al navegador cuando
        // NOPAL se usa desde esa misma máquina. Para cualquier otro cliente
        // en la red, hay que abrir el link con el host con el que el
        // navegador ya está hablando (la IP/dominio de la barra de
        // direcciones), que es el mismo servidor.
        const isLocalHost = host === '127.0.0.1' || host === 'localhost' || host === '0.0.0.0';
        const linkHost = isLocalHost && window.location.hostname ? window.location.hostname : host;
        const url = `http://${linkHost}:${port}`;
        return `
            <section class="spm-sidebar-card spm-external-link-card">
                <div class="spm-external-link-brand">
                    ${icon(ICON_SPOOL, 22)}
                    <span>Spoolman</span>
                </div>
                <a class="spm-btn-accent spm-external-link-btn" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${tr('goToSpoolman')}</a>
            </section>`;
    }

    function renderSidebar() {
        if (!state.config?.configured) return '';
        return `
            <aside class="spm-sidebar">
                <section class="spm-sidebar-card">
                    <div class="spm-sidebar-card-header">
                        <h3>${tr('printersAndAssignedSpool')}</h3>
                        <button type="button" class="spm-icon-btn" id="spm-refresh-printers" title="${tr('refreshTitle')}">${icon(ICON_REFRESH, 14)}</button>
                    </div>
                    ${state.printers.length ? state.printers.map(renderPrinterRow).join('') : `<div class="spm-empty">${tr('noKlipperPrintersDetected')}</div>`}
                </section>
                <section class="spm-sidebar-card">
                    <h3>${tr('reservationsForProduction')}</h3>
                    ${state.reservations.length ? state.reservations.slice(0, 5).map(r => {
                        const spool = state.spools.find(s => s.id === r.spool_id);
                        return `
                        <div class="spm-mini-row">
                            ${icon(ICON_LOCK, 14)}
                            <span class="spm-mini-row-label">${esc(r.quote_label)}</span>
                            ${spool ? `<span class="spm-color-dot spm-mini-row-dot" style="background:${spoolColor(spool)}"></span><span class="spm-mini-row-material">${esc(spoolLabel(spool))}</span>` : ''}
                            <strong>${esc(fmtWeight(r.grams))}</strong>
                        </div>`;
                    }).join('') : `<div class="spm-empty">${tr('noReservations')}</div>`}
                </section>
                <div class="spm-sidebar-mini-row">
                    ${renderMiniCotizador()}
                    ${renderMiniConsumo()}
                    ${renderMiniAlertas()}
                </div>
                ${renderSpoolmanLinkCard()}
            </aside>`;
    }

    // Formulario de conexión -- vive en un único lugar (el panel de
    // Configuración, siempre presente en el DOM) para no duplicar el id
    // #spm-config-form; el cuerpo principal cuando no hay conexión solo
    // muestra un aviso corto que abre ese mismo panel.
    function renderConfigForm() {
        const config = state.config || {};
        return `
            <form id="spm-config-form" class="spm-form">
                <label>${tr('hostIpLabel')}<input type="text" name="host" placeholder="192.168.1.50" value="${esc(config.host || '')}" required></label>
                <label>${tr('portLabel')}<input type="number" name="port" placeholder="7912" value="${esc(config.port || 7912)}" required></label>
                <button type="submit" class="spm-btn-accent">${tr('connectBtn')}</button>
            </form>`;
    }

    function renderDiscoveryResults() {
        if (state.discovering) {
            return `<p class="spm-discovery-status">${icon(ICON_REFRESH, 14)}<span>${tr('searchingSpoolman')}</span></p>`;
        }
        if (state.discovered === null) return '';
        if (!state.discovered.length) {
            return `<p class="spm-discovery-status"><span>${tr('noSpoolmanFoundOnNetwork')}</span> <button type="button" class="spm-link-btn" data-spm-discover-again>${tr('searchAgain')}</button></p>`;
        }
        return `
            <div class="spm-discovery-list">
                <p class="spm-discovery-found">${tr('foundServers', { count: state.discovered.length })}</p>
                ${state.discovered.map(item => `
                    <button type="button" class="spm-discovery-item" data-spm-connect-host="${esc(item.host)}" data-spm-connect-port="${esc(item.port)}">
                        ${icon(ICON_SPOOL, 18)}
                        <span class="spm-discovery-item-body">
                            <strong>${esc(item.host)}:${esc(item.port)}</strong>
                            <small>${item.host === '127.0.0.1' ? tr('thisSameServer') : tr('onYourLocalNetwork')}${item.info?.version ? ` · v${esc(item.info.version)}` : ''}</small>
                        </span>
                    </button>
                `).join('')}
            </div>`;
    }

    function renderNotConfiguredPrompt() {
        return `
            <div class="spm-config-gate">
                <div class="spm-config-card">
                    ${icon(ICON_SPOOL, 40)}
                    <h2>${tr('connectYourSpoolmanServer')}</h2>
                    <p>${tr('spoolmanIntro')}</p>
                    ${renderDiscoveryResults()}
                    <button type="button" class="spm-btn-accent" data-spm-open-settings-inline>${tr('configureConnectionManually')}</button>
                </div>
            </div>`;
    }

    function moduleHtml() {
        return `
            <section id="spoolman-section" class="view-section spm-section" style="display:none">
                <div class="spm-scroll">
                    <header class="spm-header">
                        <div class="spm-header-copy">
                            <h1>${tr('materialsTitle')}</h1>
                            <div class="spm-header-subrow">
                                <span class="spm-header-sub">${tr('filamentsInventorySub')}</span>
                                <span class="spm-status-pill ${state.config?.connected ? 'spm-status-ok' : 'spm-status-off'}">
                                    <span class="spm-status-dot"></span>
                                    Spoolman ${state.config?.connected ? tr('spoolmanConnected') : tr('spoolmanDisconnected')}
                                </span>
                            </div>
                        </div>
                        <div class="spm-header-actions">
                            <button type="button" class="spm-icon-btn" id="spm-open-settings" title="${tr('configureConnectionTitle')}">${icon(ICON_SETTINGS, 18)}</button>
                        </div>
                    </header>
                    <div id="spm-body">
                        ${state.config?.configured ? '' : renderNotConfiguredPrompt()}
                    </div>
                </div>

                <div class="spm-panel-overlay" id="spm-settings-panel" hidden>
                    <div class="spm-panel-backdrop" data-spm-close-settings></div>
                    <div class="spm-panel-dialog">
                        <div class="spm-panel-header"><strong>${tr('spoolmanSettingsTitle')}</strong><button type="button" data-spm-close-settings>${icon('<path d="M18 6 6 18M6 6l12 12"/>', 16)}</button></div>
                        ${renderConfigForm()}
                        ${state.config?.configured ? `<button type="button" class="spm-btn-danger" id="spm-disconnect-btn">${tr('disconnectBtn')}</button>` : ''}
                    </div>
                </div>

                <div class="spm-panel-overlay" id="spm-spool-detail-panel" hidden>
                    <div class="spm-panel-backdrop" data-spm-close-spool-detail></div>
                    <div class="spm-panel-dialog"></div>
                </div>
            </section>`;
    }

    function renderConfiguredBody() {
        return `
            ${renderStatTiles()}
            <div class="spm-main-layout">
                <div class="spm-main-content">
                    ${renderTabs()}
                    <div class="spm-tab-content">${renderTabContent()}</div>
                </div>
                ${renderSidebar()}
            </div>
            <p class="spm-footer-note">${tr('footerNote')}</p>`;
    }

    // render() reemplaza #spm-body entero -- sin esto, escribir en el
    // buscador de Filamentos (que sí necesita un render completo, filtra
    // toda la grilla) perdía el foco/cursor en cada letra porque innerHTML
    // recrea el <input> de cero. Se guarda foco + selección antes y se
    // restaura después si el mismo id sigue existiendo en el HTML nuevo.
    function withPreservedFocus(fn) {
        const active = document.activeElement;
        const hadFocus = active && root?.contains(active) && active.id;
        const selectionStart = hadFocus && 'selectionStart' in active ? active.selectionStart : null;
        const selectionEnd = hadFocus && 'selectionEnd' in active ? active.selectionEnd : null;
        fn();
        if (hadFocus) {
            const restored = root.querySelector(`#${CSS.escape(active.id)}`);
            if (restored) {
                restored.focus();
                if (selectionStart != null && 'setSelectionRange' in restored) {
                    try { restored.setSelectionRange(selectionStart, selectionEnd); } catch (error) { /* tipos sin selección (number, etc.) */ }
                }
            }
        }
    }

    function render() {
        if (!root) return;
        withPreservedFocus(renderBody);
    }

    function renderBody() {
        const body = root.querySelector('#spm-body');
        if (body) body.innerHTML = state.config?.configured ? renderConfiguredBody() : renderNotConfiguredPrompt();
        const statusPill = root.querySelector('.spm-status-pill');
        if (statusPill) {
            statusPill.className = `spm-status-pill ${state.config?.connected ? 'spm-status-ok' : 'spm-status-off'}`;
            statusPill.innerHTML = `<span class="spm-status-dot"></span>Spoolman ${state.config?.connected ? tr('spoolmanConnected') : tr('spoolmanDisconnected')}`;
        }
        const panelDialog = root.querySelector('#spm-settings-panel .spm-panel-dialog');
        if (panelDialog) {
            panelDialog.innerHTML = `
                <div class="spm-panel-header"><strong>${tr('spoolmanSettingsTitle')}</strong><button type="button" data-spm-close-settings>${icon('<path d="M18 6 6 18M6 6l12 12"/>', 16)}</button></div>
                ${renderConfigForm()}
                ${state.config?.configured ? `<button type="button" class="spm-btn-danger" id="spm-disconnect-btn">${tr('disconnectBtn')}</button>` : ''}`;
        }
        const detailDialog = root.querySelector('#spm-spool-detail-panel .spm-panel-dialog');
        if (detailDialog && state.detailSpoolId != null) {
            detailDialog.innerHTML = renderSpoolDetailDialog(state.detailSpoolId);
        }
        bindBodyEvents();
        bindSettingsPanelEvents();
        bindSpoolDetailPanelEvents();
    }

    // ── Eventos ──

    async function handleConfigSubmit(event) {
        event.preventDefault();
        const form = event.target;
        const formData = new FormData(form);
        try {
            await api('/api/spoolman/config', { method: 'POST', body: formData });
            toast(tr('connectedToSpoolman'));
            root.querySelector('#spm-settings-panel').hidden = true;
            await refreshAll();
        } catch (error) {
            alertDialog(error.message || tr('couldNotConnect'));
        }
    }

    async function handleReservationSubmit(event) {
        event.preventDefault();
        const form = event.target;
        const formData = new FormData(form);
        const quoteSelect = form.querySelector('#spm-quote-select');
        const selectedOption = quoteSelect ? quoteSelect.options[quoteSelect.selectedIndex] : null;
        formData.set('quote_id', formData.get('quote_select') || '');
        if (!formData.get('quote_label') && selectedOption) formData.set('quote_label', selectedOption.dataset.label || '');
        if (!formData.get('quote_id')) formData.set('quote_id', 'manual');
        try {
            await api('/api/spoolman/reservations', { method: 'POST', body: formData });
            toast(tr('reservationCreated'));
            await loadDashboardData();
            render();
        } catch (error) {
            alertDialog(error.message || tr('couldNotCreateReservation'));
        }
    }

    function bindBodyEvents() {
        root.querySelectorAll('[data-spm-open-spool-detail]').forEach(btn => {
            btn.addEventListener('click', () => {
                state.detailSpoolId = Number(btn.dataset.spmOpenSpoolDetail);
                const panel = root.querySelector('#spm-spool-detail-panel');
                if (panel) panel.hidden = false;
                render();
            });
        });
        root.querySelector('#spm-refresh-printers')?.addEventListener('click', async () => {
            await loadDashboardData();
            render();
        });
        root.querySelector('#spm-mq-spool')?.addEventListener('change', event => {
            state.miniQuoteSpoolId = Number(event.target.value) || null;
            render();
        });
        root.querySelector('#spm-mq-weight')?.addEventListener('input', event => {
            state.miniQuoteWeightG = event.target.value;
            updateMiniQuoteTotals();
        });
        root.querySelector('#spm-mq-waste')?.addEventListener('input', event => {
            state.miniQuoteWastePercent = event.target.value;
            updateMiniQuoteTotals();
        });
        root.querySelector('#spm-toggle-alerts')?.addEventListener('click', () => {
            state.alertsExpanded = !state.alertsExpanded;
            render();
        });

        root.querySelectorAll('[data-spm-tab]').forEach(btn => {
            btn.addEventListener('click', () => { state.activeTab = btn.dataset.spmTab; render(); });
        });
        root.querySelectorAll('[data-spm-view]').forEach(btn => {
            btn.addEventListener('click', () => { state.viewMode = btn.dataset.spmView; render(); });
        });
        root.querySelector('#spm-search')?.addEventListener('input', event => { state.search = event.target.value; render(); });
        root.querySelector('#spm-material-filter')?.addEventListener('change', event => { state.materialFilter = event.target.value; render(); });
        root.querySelector('#spm-status-filter')?.addEventListener('change', event => { state.statusFilter = event.target.value; render(); });

        root.querySelectorAll('[data-spm-open-settings-inline]').forEach(btn => {
            btn.addEventListener('click', () => {
                const panel = root.querySelector('#spm-settings-panel');
                if (panel) panel.hidden = false;
            });
        });
        root.querySelectorAll('[data-spm-connect-host]').forEach(btn => {
            btn.addEventListener('click', () => connectToDiscovered(btn.dataset.spmConnectHost, btn.dataset.spmConnectPort));
        });
        root.querySelector('[data-spm-discover-again]')?.addEventListener('click', () => discoverSpoolman());
        root.querySelector('#spm-reservation-form')?.addEventListener('submit', handleReservationSubmit);
        root.querySelector('#spm-quote-select')?.addEventListener('change', event => {
            const option = event.target.options[event.target.selectedIndex];
            const gramsInput = root.querySelector('#spm-reservation-grams');
            const labelInput = root.querySelector('#spm-quote-label');
            if (option?.dataset.grams && gramsInput && !gramsInput.value) gramsInput.value = Math.round(Number(option.dataset.grams));
            if (option?.dataset.label && labelInput) labelInput.value = option.dataset.label;
        });

        root.querySelectorAll('[data-spm-delete-reservation]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const confirmed = await confirmDialog(tr('confirmReleaseReservation'), tr('deleteReservationTitle'));
                if (!confirmed) return;
                try {
                    await api(`/api/spoolman/reservations/${btn.dataset.spmDeleteReservation}`, { method: 'DELETE' });
                    toast(tr('reservationDeleted'));
                    await loadDashboardData();
                    render();
                } catch (error) {
                    alertDialog(error.message || tr('couldNotDeleteReservation'));
                }
            });
        });

        root.querySelectorAll('.spm-printer-spool-select').forEach(select => {
            select.addEventListener('change', async () => {
                const port = select.dataset.spmPrinterPort;
                try {
                    if (select.value) {
                        const formData = new FormData();
                        formData.append('spool_id', select.value);
                        await api(`/api/spoolman/printers/${port}/active-spool`, { method: 'POST', body: formData });
                        toast(tr('spoolAssigned'));
                    } else {
                        await api(`/api/spoolman/printers/${port}/active-spool`, { method: 'DELETE' });
                        toast(tr('spoolUnassigned'));
                    }
                    await loadDashboardData();
                    render();
                } catch (error) {
                    alertDialog(error.message || tr('couldNotUpdateAssignment'));
                }
            });
        });
    }

    // Elementos estáticos de los overlays que nunca se recrean (los backdrops
    // y el botón engranaje de la topbar) -- se bindean una sola vez, al
    // montar. Escopados por id porque ahora hay más de un `.spm-panel-backdrop`
    // en el DOM (Configuración y Detalle del spool).
    function bindChromeEvents() {
        root.querySelector('#spm-open-settings')?.addEventListener('click', () => {
            const panel = root.querySelector('#spm-settings-panel');
            if (panel) panel.hidden = false;
        });
        root.querySelector('#spm-settings-panel .spm-panel-backdrop')?.addEventListener('click', () => {
            const panel = root.querySelector('#spm-settings-panel');
            if (panel) panel.hidden = true;
        });
        root.querySelector('#spm-spool-detail-panel .spm-panel-backdrop')?.addEventListener('click', () => {
            const panel = root.querySelector('#spm-spool-detail-panel');
            if (panel) panel.hidden = true;
        });
    }

    // Contenido del panel de Configuración -- se recrea en cada render()
    // (para reflejar host/puerto guardados y si ya hay conexión), así que
    // sus listeners se re-bindean cada vez, igual que bindBodyEvents().
    function bindSettingsPanelEvents() {
        root.querySelector('#spm-settings-panel .spm-panel-dialog [data-spm-close-settings]')?.addEventListener('click', () => {
            const panel = root.querySelector('#spm-settings-panel');
            if (panel) panel.hidden = true;
        });
        root.querySelector('#spm-config-form')?.addEventListener('submit', handleConfigSubmit);
        root.querySelector('#spm-disconnect-btn')?.addEventListener('click', async () => {
            const confirmed = await confirmDialog(tr('confirmDisconnectSpoolman'), tr('disconnectBtn'));
            if (!confirmed) return;
            await api('/api/spoolman/config', { method: 'DELETE' });
            root.querySelector('#spm-settings-panel').hidden = true;
            await refreshAll();
        });
    }

    // Contenido del panel de Detalle del spool -- se recrea en cada render()
    // (para reflejar el spool elegido en state.detailSpoolId), así que su
    // botón de cerrar se re-bindea cada vez, igual que bindSettingsPanelEvents().
    function bindSpoolDetailPanelEvents() {
        root.querySelector('#spm-spool-detail-panel .spm-panel-dialog [data-spm-close-spool-detail]')?.addEventListener('click', () => {
            const panel = root.querySelector('#spm-spool-detail-panel');
            if (panel) panel.hidden = true;
        });
    }

    function mount() {
        if (document.getElementById('spoolman-section')) return;
        const pluginsContainer = document.querySelector('.nav-category[data-group="plugins"] .nav-category-items');
        const navButton = document.createElement('button');
        navButton.type = 'button';
        navButton.className = 'nav-item';
        navButton.dataset.section = 'spoolman';
        navButton.dataset.pluginNav = PLUGIN_ID;
        navButton.title = tr('materialsTitle');
        navButton.innerHTML = `${icon(ICON_SPOOL, 20)}<span>${tr('materialsTitle')}</span>`;
        // El plugin monta una sola vez y la sección queda en el DOM -- sin
        // esto, volver a "Materiales" después de visitar otra sección
        // mostraba datos ya viejos hasta el próximo refresh manual.
        navButton.addEventListener('click', () => {
            window.switchSection?.('spoolman');
            refreshAll();
        });
        pluginsContainer?.appendChild(navButton);

        const wrapper = document.createElement('div');
        wrapper.innerHTML = moduleHtml();
        root = wrapper.firstElementChild;
        const content = document.querySelector('.content');
        content?.insertBefore(root, document.getElementById('gcode-editor-section'));

        bindChromeEvents();
        refreshAll();
        window.applySidebarOrder?.();
    }

    function unmount() {
        document.querySelector(`[data-plugin-nav="${PLUGIN_ID}"]`)?.remove();
        document.getElementById('spoolman-section')?.remove();
        root = null;
    }

    window.NopalPluginRegistry = window.NopalPluginRegistry || {};
    window.NopalPluginRegistry[PLUGIN_ID] = { mount, unmount, version: '0.2.0' };
    mount();
})();
