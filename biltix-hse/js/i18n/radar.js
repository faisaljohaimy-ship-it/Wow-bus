/**
 * BILTIX Risk AI — text drawn inside the canvas radars (js/ui/radar.js).
 * Namespace 'radar' (registered by js/ui/i18n-bridge.js). Owner: A-UI.
 */
export default {
  ar: {
    noSensors: 'لا توجد حساسات نشطة',
    noItems: 'لا توجد بنود للتقييم',
    target: 'الهدف',
    north: 'ش',
    kinds: { worker: 'عامل', vehicle: 'مركبة', crane: 'رافعة', hazard: 'خطر' },
    // links into the site spatial view (#/spatial)
    spatial: {
      showOnMap: 'عرض على خريطة الموقع',
      showOnMapAria: 'عرض {site} على خريطة الموقع المكانية',
      sensorsOnMap: 'عرض الحساسات على خريطة الموقع',
      sensorsOnMapAria: 'عرض حساسات {site} على خريطة الموقع المكانية',
      zoneOnMap: 'عرض المنطقة {zone} على خريطة الموقع',
    },
  },
  en: {
    noSensors: 'No active sensors',
    noItems: 'No items to assess',
    target: 'Target',
    north: 'N',
    kinds: { worker: 'Worker', vehicle: 'Vehicle', crane: 'Crane', hazard: 'Hazard' },
    // links into the site spatial view (#/spatial)
    spatial: {
      showOnMap: 'Show on site map',
      showOnMapAria: 'Show {site} on the site spatial view',
      sensorsOnMap: 'Show sensors on site map',
      sensorsOnMapAria: 'Show the sensors of {site} on the site spatial view',
      zoneOnMap: 'Show zone {zone} on the site map',
    },
  },
};
