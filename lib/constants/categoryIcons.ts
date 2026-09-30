/**
 * Curated subset of Lucide icons for expense categories.
 * Keys are exact Lucide component names (used for dynamic lookup).
 * Values are Italian display labels for accessibility (aria-label).
 *
 * IMPORTANT: If you add an icon here, add its loader to
 * `components/expenses/categoryIconLoaders.ts` (one chunk per icon, PERF-04);
 * `__tests__/categoryIcons.test.ts` goes red until both lists match lucide.
 */
export const CATEGORY_ICONS: Record<string, string> = {
  // ── Food & drink ─────────────────────────────────────────────────────────
  UtensilsCrossed: 'Ristorante',
  Coffee: 'Caffè',
  ShoppingBasket: 'Spesa alimentare',
  Pizza: 'Pizza',
  Wine: 'Vino / Bar',
  Beer: 'Birra',
  Sandwich: 'Panino / Fast food',
  Salad: 'Pranzo / Insalata',
  IceCream: 'Gelato',
  CupSoda: 'Bevande',
  Cookie: 'Dolci / Pasticceria',
  ChefHat: 'Cucina',

  // ── Home & utilities ─────────────────────────────────────────────────────
  Home: 'Casa',
  Key: 'Affitto',
  Lightbulb: 'Utenze',
  Wifi: 'Internet',
  Tv: 'TV / Streaming',
  Wrench: 'Riparazioni',
  Sofa: 'Arredamento',
  Plug: 'Elettricità',
  Droplets: 'Acqua',
  Flame: 'Gas',
  Hammer: 'Lavori domestici',
  Shield: 'Sicurezza',
  Lock: 'Sicurezza casa',
  Thermometer: 'Riscaldamento',

  // ── Transport ────────────────────────────────────────────────────────────
  Car: 'Automobile',
  Bus: 'Trasporto pubblico',
  Train: 'Treno',
  Plane: 'Aereo / Viaggi',
  Fuel: 'Carburante',
  ParkingSquare: 'Parcheggio',
  Bike: 'Bicicletta',
  MapPin: 'Spostamento',
  Footprints: 'A piedi',
  Sailboat: 'Barca',

  // ── Health & wellness ────────────────────────────────────────────────────
  HeartPulse: 'Salute',
  Stethoscope: 'Medico',
  Pill: 'Farmaci',
  Dumbbell: 'Palestra',
  Activity: 'Sport / Fitness',
  Heart: 'Benessere',
  Brain: 'Psicologia',
  Ambulance: 'Pronto soccorso',

  // ── Entertainment & leisure ──────────────────────────────────────────────
  Music: 'Musica',
  Gamepad2: 'Videogiochi',
  Clapperboard: 'Cinema',
  BookOpen: 'Libri / Lettura',
  Camera: 'Fotografia',
  Ticket: 'Biglietti / Eventi',
  Theater: 'Teatro',
  Headphones: 'Podcast / Streaming audio',
  Popcorn: 'Spettacolo',
  Dice5: 'Giochi / Svago',
  Palette: 'Arte / Creatività',

  // ── Shopping & personal care ─────────────────────────────────────────────
  ShoppingCart: 'Shopping',
  ShoppingBag: 'Acquisti',
  Shirt: 'Abbigliamento',
  Scissors: 'Cura personale',
  Gem: 'Gioielli / Lusso',
  Package: 'Acquisti online',
  Backpack: 'Zaino / Accessori',
  Sparkles: 'Bellezza / Estetica',
  Watch: 'Orologi',
  Glasses: 'Ottica / Occhiali',

  // ── Travel ───────────────────────────────────────────────────────────────
  Globe: 'Viaggi internazionali',
  Hotel: 'Hotel / Alloggio',
  Luggage: 'Valigia / Viaggio',
  Map: 'Mappa / Turismo',
  Compass: 'Esplorazione',
  Umbrella: 'Vacanze',
  Mountain: 'Trekking / Montagna',

  // ── Finance & work ───────────────────────────────────────────────────────
  Banknote: 'Contanti',
  CreditCard: 'Carte di credito',
  TrendingUp: 'Investimenti / Crescita',
  TrendingDown: 'Perdite',
  PiggyBank: 'Risparmio',
  Briefcase: 'Lavoro',
  Building2: 'Azienda',
  GraduationCap: 'Formazione',
  Laptop: 'Tecnologia',
  Calculator: 'Contabilità',
  Receipt: 'Ricevute / Fatture',
  Coins: 'Monete / Piccole spese',
  Percent: 'Interessi / Commissioni',
  HandCoins: 'Pagamenti',
  Award: 'Premio / Bonus',
  BadgeCheck: 'Stipendio / Reddito',
  BarChart2: 'Rendimento',
  Landmark: 'Banca / Istituto',
  Wallet: 'Portafoglio',
  DollarSign: 'Entrate generiche',
  CircleDollarSign: 'Rimborso',
  Zap: 'Entrata extra / Bonus',
  Building: 'Edificio / Immobile',

  // ── Family & social ──────────────────────────────────────────────────────
  Baby: 'Bambini / Asilo nido',
  Dog: 'Animali domestici',
  Users: 'Famiglia',
  Gift: 'Regali',
  PartyPopper: 'Feste / Celebrazioni',
  School: 'Scuola',
  Candy: 'Dolciumi / Bambini',
  Puzzle: 'Giocattoli',

  // ── Subscriptions & digital ──────────────────────────────────────────────
  Smartphone: 'Telefono / App',
  Mail: 'Abbonamenti / Email',
  Monitor: 'Computer / SaaS',
  Printer: 'Stampa / Ufficio',
  Play: 'Streaming video',
  Repeat: 'Abbonamento ricorrente',

  // ── Insurance & protection ───────────────────────────────────────────────
  ShieldCheck: 'Assicurazione',
  ShieldAlert: 'Polizza / Garanzia',

  // ── Transfer ─────────────────────────────────────────────────────────────
  ArrowLeftRight: 'Trasferimento',
  Shuffle: 'Scambio / Conversione',
  MoveRight: 'Bonifico',
  ChevronsLeftRight: 'Trasferimento tra conti',

  // ── Misc ─────────────────────────────────────────────────────────────────
  Tag: 'Generico',
  Star: 'Preferito / Vario',
  AlertCircle: 'Importante / Urgente',
  Archive: 'Archivio',
  Leaf: 'Natura / Sostenibilità',
  Sun: 'Tempo libero',
};

/**
 * Icon names ordered by relevance for each expense type.
 * Used by IconPickerPopover to surface relevant icons first.
 * All icons listed here must exist as keys in CATEGORY_ICONS.
 */
export const CATEGORY_ICONS_BY_TYPE: Record<string, string[]> = {
  variable: [
    // Food
    'UtensilsCrossed', 'Coffee', 'ShoppingBasket', 'Pizza', 'Wine', 'Beer', 'Sandwich', 'Salad',
    'IceCream', 'CupSoda', 'Cookie', 'ChefHat',
    // Transport
    'Car', 'Bus', 'Train', 'Fuel', 'ParkingSquare', 'Bike', 'MapPin', 'Footprints',
    // Entertainment
    'Music', 'Gamepad2', 'Clapperboard', 'Ticket', 'Theater', 'Headphones', 'Popcorn', 'Dice5', 'Palette',
    // Shopping
    'ShoppingCart', 'ShoppingBag', 'Shirt', 'Package', 'Backpack', 'Scissors', 'Sparkles', 'Gem', 'Watch', 'Glasses',
    // Travel
    'Plane', 'Globe', 'Hotel', 'Luggage', 'Camera', 'Map', 'Compass', 'Mountain',
    // Health
    'HeartPulse', 'Dumbbell', 'Activity', 'Heart',
    // Family & kids
    'Baby', 'Dog', 'Gift', 'PartyPopper', 'Candy', 'Puzzle',
    // Misc
    'Tag', 'Star', 'AlertCircle', 'Leaf', 'Sun',
  ],
  fixed: [
    // Home & utilities
    'Home', 'Key', 'Lightbulb', 'Wifi', 'Tv', 'Plug', 'Droplets', 'Flame', 'Wrench', 'Hammer',
    'Shield', 'Lock', 'Thermometer', 'Sofa',
    // Subscriptions
    'Mail', 'Smartphone', 'Play', 'Repeat', 'Monitor', 'Printer', 'Headphones',
    // Insurance
    'ShieldCheck', 'ShieldAlert', 'Umbrella',
    // Education
    'GraduationCap', 'School', 'BookOpen',
    // Work & tech
    'Briefcase', 'Laptop', 'Building2',
    // Transport
    'Bus', 'Train', 'Car',
    // Family
    'Baby', 'Dog', 'Users',
    // Misc
    'Tag', 'Star', 'AlertCircle',
  ],
  debt: [
    // Financial
    'CreditCard', 'Banknote', 'Calculator', 'Receipt', 'Coins', 'Percent', 'HandCoins',
    // Property & vehicles
    'Home', 'Key', 'Car', 'Building', 'Building2',
    // Work
    'Briefcase', 'GraduationCap',
    // Trends
    'TrendingDown', 'AlertCircle',
    // Misc
    'Tag', 'Package', 'Hammer',
  ],
  income: [
    // Work & salary
    'Briefcase', 'Building2', 'Laptop', 'Award', 'BadgeCheck', 'Users', 'Star',
    // Financial returns
    'TrendingUp', 'PiggyBank', 'BarChart2', 'Landmark', 'Coins', 'HandCoins',
    // Money
    'DollarSign', 'Wallet', 'Banknote', 'CircleDollarSign', 'Percent',
    // Bonus & extra
    'Zap', 'Gift', 'PartyPopper',
    // Property
    'Home', 'Building', 'Key',
    // Misc
    'Tag', 'Star', 'AlertCircle',
  ],
  transfer: [
    // Transfer actions
    'ArrowLeftRight', 'Shuffle', 'MoveRight', 'ChevronsLeftRight', 'Repeat',
    // Accounts
    'Wallet', 'Landmark', 'Building', 'CreditCard', 'PiggyBank', 'Banknote',
    'HandCoins', 'Coins', 'CircleDollarSign',
    // Misc
    'Tag',
  ],
};

/** Ordered list of all icon names for rendering the picker grid (no type filter). */
export const CATEGORY_ICON_NAMES = Object.keys(CATEGORY_ICONS);
