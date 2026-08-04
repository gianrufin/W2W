import type { CinemaChain } from '@/types';

/**
 * Venue registry.
 *
 * Scrapers only ever return a branch *name*; this table is what turns that name
 * into a point on the map. Coordinates are approximate mall centroids — good to
 * roughly a block, which is the resolution the distance sort needs.
 *
 * These entries used to outrank the ClickTheCity directory on the reasoning
 * that a hand-written table beats a scraped one. That was wrong, and an audit
 * proved it: Evia Lifestyle Center was recorded here 4.28 km from where it
 * actually is, because it was typed from memory rather than read off a map.
 *
 * So the rule is now about evidence, not provenance. `verified` marks an entry
 * a human has actually checked against a map; only those outrank the directory.
 * Everything else is a fallback for venues no directory lists.
 */
export interface VenueRecord {
  name: string;
  slug: string;
  chain: CinemaChain;
  lat: number;
  lng: number;
  address: string;
  city: string;
  website_url?: string;
  /**
   * Corroborated against an independent source — normally OpenStreetMap, via
   * `npm run audit:venues` — with the source named in a comment above the entry.
   *
   * Verified entries override the directory; unverified ones only fill gaps.
   * This is not the same as "someone stood outside the building": it means the
   * coordinate agrees with a map that was not written by us. Do not set it
   * because an entry looks plausible.
   */
  verified?: boolean;
}

export const SM_BRANCHES: VenueRecord[] = [
  {
    name: 'SM Megamall Cinema',
    slug: 'sm-megamall',
    chain: 'SM',
    lat: 14.5851,
    lng: 121.0568,
    address: 'EDSA cor. Julia Vargas Ave., Mandaluyong',
    city: 'Mandaluyong',
  },
  {
    name: 'SM City North EDSA Cinema',
    slug: 'sm-north-edsa',
    chain: 'SM',
    lat: 14.6564,
    lng: 121.0301,
    address: 'North Ave. cor. EDSA, Quezon City',
    city: 'Quezon City',
  },
  {
    name: 'SM Mall of Asia Cinema',
    slug: 'sm-mall-of-asia',
    chain: 'SM',
    lat: 14.5352,
    lng: 120.9822,
    address: 'Seaside Blvd., Pasay City',
    city: 'Pasay',
  },
  {
    name: 'SM Aura Premier Cinema',
    slug: 'sm-aura',
    chain: 'SM',
    lat: 14.5468,
    lng: 121.0553,
    address: '26th St. cor. McKinley Pkwy., BGC, Taguig',
    city: 'Taguig',
  },
  {
    name: 'SM City Cebu Cinema',
    slug: 'sm-city-cebu',
    chain: 'SM',
    lat: 10.3117,
    lng: 123.9182,
    address: 'Juan Luna Ave., North Reclamation Area, Cebu City',
    city: 'Cebu City',
  },
];

export const AYALA_BRANCHES: VenueRecord[] = [
  {
    // Corrected from 14.5525, 121.0235 — 0.31 km out. OSM found Glorietta 4 Cinemas
    // on North Street, rather than the mall complex's centre.
    name: 'Glorietta 4 Cinemas',
    slug: 'glorietta-4',
    chain: 'Ayala',
    lat: 14.55125,
    lng: 121.02604,
    address: 'Glorietta 4, Ayala Center, Makati',
    city: 'Makati',
    verified: true,
  },
  {
    name: 'Greenbelt 3 Cinemas',
    slug: 'greenbelt-3',
    chain: 'Ayala',
    lat: 14.5527,
    lng: 121.0206,
    address: 'Greenbelt 3, Legazpi St., Makati',
    city: 'Makati',
  },
  {
    // Corrected from 14.5305 — 0.88 km north of the mall. Directory value.
    name: 'Ayala Malls Manila Bay Cinemas',
    slug: 'ayala-manila-bay',
    chain: 'Ayala',
    lat: 14.52261,
    lng: 120.99016,
    address: 'Diosdado Macapagal Blvd., Entertainment City, Parañaque',
    city: 'Parañaque',
    verified: true,
  },
  {
    name: 'Trinoma Cinemas',
    slug: 'trinoma',
    chain: 'Ayala',
    lat: 14.6533,
    lng: 121.0327,
    address: 'EDSA cor. North Ave., Quezon City',
    city: 'Quezon City',
  },
  {
    name: 'Ayala Center Cebu Cinemas',
    slug: 'ayala-center-cebu',
    chain: 'Ayala',
    lat: 10.3181,
    lng: 123.9052,
    address: 'Cebu Business Park, Cebu City',
    city: 'Cebu City',
  },
];

export const VISTA_BRANCHES: VenueRecord[] = [
  {
    // The chain writes this branch "Vista Cinemas SOMO"; it is in no
    // aggregator's directory, so its coordinates have to live here.
    //
    // Corrected from 14.3308, 120.9421 — 7.13 km south of the mall, the worst
    // error the audit found. OSM places SoMo on Daang Hari in Molino, Bacoor.
    name: 'Vista Mall SOMO',
    slug: 'vista-mall-somo',
    chain: 'Vista',
    lat: 14.38344,
    lng: 120.97988,
    address: 'Daang Hari Rd., Molino, Bacoor, Cavite',
    city: 'Bacoor',
    verified: true,
  },
  {
    name: 'Vista Mall Taguig Cinemas',
    slug: 'vista-mall-taguig',
    chain: 'Vista',
    lat: 14.5175,
    lng: 121.0384,
    address: 'Gen. Espino St., Taguig',
    city: 'Taguig',
  },
  {
    name: 'Starmall Alabang Cinemas',
    slug: 'starmall-alabang',
    chain: 'Vista',
    lat: 14.4189,
    lng: 121.0192,
    address: 'Alabang-Zapote Rd., Muntinlupa',
    city: 'Muntinlupa',
  },
  {
    // Corrected from 14.3921, 120.9756 — that was 4.28 km west of the mall, in
    // the wrong barangay entirely. Verified against the ClickTheCity directory,
    // which places it in Tindig na Mangga, Almanza Dos, where it is.
    name: 'Evia Lifestyle Center Cinemas',
    slug: 'evia-lifestyle-center',
    chain: 'Vista',
    lat: 14.3758,
    lng: 121.01165,
    address: 'Daang Hari Rd., Almanza Dos, Las Piñas',
    city: 'Las Piñas',
    verified: true,
  },
];

/**
 * Branches no aggregator lists, so their coordinates have nowhere else to come
 * from. Every one of these was reported by a scrape run as unplaceable — that
 * report is the intended way to find them, and adding the entry here is the fix.
 */
export const MANUAL_BRANCHES: VenueRecord[] = [
  {
    // Corrected from 15.1656, 120.5908 — 0.93 km out. OSM: Dolores St., Balibago.
    name: 'Robinsons Angeles',
    slug: 'rmw-angeles',
    chain: 'Robinsons',
    lat: 15.15725,
    lng: 120.5916,
    address: 'McArthur Highway, Balibago, Angeles City',
    city: 'Angeles City',
    verified: true,
  },
  {
    name: 'Robinsons Gapan',
    slug: 'rmw-gapan',
    chain: 'Robinsons',
    lat: 15.3081,
    lng: 120.9469,
    address: 'Maharlika Highway, Gapan City, Nueva Ecija',
    city: 'Gapan City',
  },
  {
    // Corrected from 6.1103, 125.1716 — 2.46 km out. OSM: Digos-Makar Road, Lagao.
    // The chain abbreviates General Santos to "GENSAN" in its branch list.
    name: 'Robinsons Gensan',
    slug: 'rmw-gensan',
    chain: 'Robinsons',
    lat: 6.12121,
    lng: 125.19094,
    address: 'J. Catolico Sr. Ave., General Santos City',
    city: 'General Santos City',
    verified: true,
  },
  {
    // Corrected from 14.6222, 121.0951 — 0.61 km out. OSM: Marcos Hwy., Dela Paz.
    name: 'Robinsons Metro East',
    slug: 'rmw-metro-east',
    chain: 'Robinsons',
    lat: 14.61946,
    lng: 121.10002,
    address: 'Marcos Highway, Brgy. Dela Paz, Pasig',
    city: 'Pasig',
    verified: true,
  },
  {
    name: 'Robinsons Pagadian',
    slug: 'rmw-pagadian',
    chain: 'Robinsons',
    lat: 7.8257,
    lng: 123.437,
    address: 'F.S. Pajares Ave., Pagadian City, Zamboanga del Sur',
    city: 'Pagadian City',
  },
  {
    name: 'Robinsons Santiago',
    slug: 'rmw-santiago',
    chain: 'Robinsons',
    lat: 16.6874,
    lng: 121.546,
    address: 'Maharlika Highway, Santiago City, Isabela',
    city: 'Santiago City',
  },
  {
    // Corrected from 7.4478, 125.8078 — 2.32 km out. OSM: Davao-Agusan National Hwy.
    name: 'Robinsons Tagum',
    slug: 'rmw-tagum',
    chain: 'Robinsons',
    lat: 7.42957,
    lng: 125.79753,
    address: 'Apokon Rd., Tagum City, Davao del Norte',
    city: 'Tagum City',
    verified: true,
  },
  {
    name: 'Eastwood Cinemas',
    slug: 'eastwood-cinemas',
    chain: 'Megaworld',
    lat: 14.6091,
    lng: 121.08,
    address: 'Eastwood City, Bagumbayan, Quezon City',
    city: 'Quezon City',
  },
  {
    // Corrected from 14.5583, 121.0501 — 0.50 km out. OSM found the cinema itself,
    // not the district centroid.
    // Listed as plain "Uptown Cinemas" by the chain's own API, which is too
    // generic to match the longer marketing name in the registry below.
    name: 'Uptown Cinemas',
    slug: 'uptown-cinemas',
    chain: 'Megaworld',
    lat: 14.55647,
    lng: 121.05432,
    address: '36th St. cor. 9th Ave., Uptown Bonifacio, Taguig',
    city: 'Taguig',
    verified: true,
  },
  {
    name: 'Venice Cineplex',
    slug: 'venice-cineplex',
    chain: 'Megaworld',
    lat: 14.5378,
    lng: 121.0499,
    address: 'Venice Grand Canal Mall, McKinley Hill, Taguig',
    city: 'Taguig',
  },
];

export const OTHER_COMMERCIAL_BRANCHES: VenueRecord[] = [
  {
    name: 'Robinsons Movieworld Galleria',
    slug: 'robinsons-galleria',
    chain: 'Robinsons',
    lat: 14.5901,
    lng: 121.0578,
    address: 'EDSA cor. Ortigas Ave., Quezon City',
    city: 'Quezon City',
  },
  {
    name: 'Robinsons Movieworld Manila',
    slug: 'robinsons-manila',
    chain: 'Robinsons',
    lat: 14.5786,
    lng: 120.9847,
    address: 'Pedro Gil cor. Adriatico St., Ermita, Manila',
    city: 'Manila',
  },
  {
    name: 'Megaworld Lifestyle Cinemas — Uptown BGC',
    slug: 'uptown-bgc',
    chain: 'Megaworld',
    lat: 14.5583,
    lng: 121.0501,
    address: '36th St. cor. 9th Ave., Uptown Bonifacio, Taguig',
    city: 'Taguig',
  },
  {
    name: 'Fisher Mall Cinemas Quezon Ave',
    slug: 'fisher-mall-quezon-ave',
    chain: 'Fisher',
    lat: 14.6297,
    lng: 121.0006,
    address: 'Quezon Ave. cor. Roosevelt Ave., Quezon City',
    city: 'Quezon City',
  },
  {
    name: 'Newport Cinemas — Newport World Resorts',
    slug: 'newport-cinemas',
    chain: 'Newport',
    lat: 14.5197,
    lng: 121.0201,
    address: 'Newport Blvd., Newport City, Pasay',
    city: 'Pasay',
  },
  {
    name: 'Shangri-La Plaza Cineplex',
    slug: 'shangri-la-cineplex',
    chain: 'ShangriLa',
    lat: 14.5804,
    lng: 121.0562,
    address: 'EDSA cor. Shaw Blvd., Mandaluyong',
    city: 'Mandaluyong',
  },
];

/** Microcinemas, cinematheques and the venues festivals actually run in. */
export const INDIE_VENUES: VenueRecord[] = [
  {
    name: "Cinema '76 Film Society — San Juan",
    slug: 'cinema-76-san-juan',
    chain: 'Microcinema',
    lat: 14.6019,
    lng: 121.0329,
    address: '160 Notre Dame St., San Juan City',
    city: 'San Juan',
  },
  {
    name: 'Cinema Centenario',
    slug: 'cinema-centenario',
    chain: 'Microcinema',
    lat: 14.6297,
    lng: 121.0195,
    address: '95 Maginhawa St., Teachers Village, Quezon City',
    city: 'Quezon City',
  },
  {
    name: 'Red Carpet Cinema — Shangri-La Plaza',
    slug: 'red-carpet-shangri-la',
    chain: 'Microcinema',
    lat: 14.5806,
    lng: 121.0559,
    address: 'Level 4, East Wing, Shangri-La Plaza, Mandaluyong',
    city: 'Mandaluyong',
  },
  {
    name: 'FDCP Cinematheque Manila',
    slug: 'cinematheque-manila',
    chain: 'Independent',
    lat: 14.5804,
    lng: 120.9829,
    address: '855 T.M. Kalaw St., Ermita, Manila',
    city: 'Manila',
  },
  {
    // Corrected from 10.6969, 122.5644 — 0.59 km out. OSM: Solis St., City Proper.
    name: 'FDCP Cinematheque Iloilo',
    slug: 'cinematheque-iloilo',
    chain: 'Independent',
    lat: 10.69906,
    lng: 122.56935,
    address: 'Casa Real de Iloilo, Gen. Luna St., Iloilo City',
    city: 'Iloilo City',
    verified: true,
  },
  {
    name: 'FDCP Cinematheque Davao',
    slug: 'cinematheque-davao',
    chain: 'Independent',
    lat: 7.0731,
    lng: 125.6128,
    address: 'Palma Gil St., Davao City',
    city: 'Davao City',
  },
  {
    name: 'FDCP Cinematheque Nabunturan',
    slug: 'cinematheque-nabunturan',
    chain: 'Independent',
    lat: 7.6042,
    lng: 125.9647,
    address: 'Capitol Compound, Nabunturan, Davao de Oro',
    city: 'Nabunturan',
  },
  {
    name: 'FDCP Cinematheque Negros',
    slug: 'cinematheque-negros',
    chain: 'Independent',
    lat: 10.6713,
    lng: 122.9511,
    address: 'Lacson St., Bacolod City',
    city: 'Bacolod City',
  },
  {
    name: 'Cultural Center of the Philippines (Tanghalang Manuel Conde)',
    slug: 'ccp-tanghalang-manuel-conde',
    chain: 'FestivalVenue',
    lat: 14.5556,
    lng: 120.9822,
    address: 'CCP Complex, Roxas Blvd., Pasay',
    city: 'Pasay',
  },
  {
    name: 'UP Film Institute Cine Adarna',
    slug: 'up-cine-adarna',
    chain: 'FestivalVenue',
    lat: 14.6543,
    lng: 121.0687,
    address: 'Magsaysay Ave., UP Diliman, Quezon City',
    city: 'Quezon City',
  },
  {
    name: 'Gateway Cineplex 18',
    slug: 'gateway-cineplex',
    chain: 'FestivalVenue',
    lat: 14.6199,
    lng: 121.0533,
    address: 'Araneta City, Cubao, Quezon City',
    city: 'Quezon City',
  },
];

export const ALL_VENUES: VenueRecord[] = [
  ...SM_BRANCHES,
  ...AYALA_BRANCHES,
  ...VISTA_BRANCHES,
  ...MANUAL_BRANCHES,
  ...OTHER_COMMERCIAL_BRANCHES,
  ...INDIE_VENUES,
];

export function findVenueBySlug(slug: string): VenueRecord | undefined {
  return ALL_VENUES.find((v) => v.slug === slug);
}
