/**
 * One loader per curated category icon, each a chunk of its own (2026-09-30).
 *
 * Why a hand-kept list of deep paths and not lucide's own name map: until 2026-09-30 every lazy icon
 * ran `import('lucide-react')` and read its name off the module, so the FIRST icon on screen
 * downloaded the whole library (575 KB raw) — an import read by a runtime name cannot be tree-shaken.
 * lucide's `dynamicIconImports` fixes that per icon but is a map of ~1900 loaders, and importing it
 * put ~160 KB raw into Cashflow's and Impostazioni's initial JavaScript (measured the same day). This
 * map has the 121 icons of `CATEGORY_ICONS` and nothing else: every loader resolves to lucide's
 * CANONICAL file (an alias like `Home` loads `house.js`), the bundler emits one small chunk per
 * icon, and nothing is fetched until an icon renders.
 *
 * WARNING: a name added to `CATEGORY_ICONS` needs its line here, and a lucide upgrade that moves a
 * file breaks its loader — `__tests__/categoryIcons.test.ts` loads all 121 and compares each with
 * lucide's own map, so either goes red there, never silently on screen. The types of these
 * untyped modules are declared in `types/lucide-icon-modules.d.ts`.
 */
import type { LucideIcon } from 'lucide-react';

export type CategoryIconLoader = () => Promise<{ default: LucideIcon }>;

export const CATEGORY_ICON_LOADERS: Record<string, CategoryIconLoader> = {
  UtensilsCrossed: () => import('lucide-react/dist/esm/icons/utensils-crossed.js'),
  Coffee: () => import('lucide-react/dist/esm/icons/coffee.js'),
  ShoppingBasket: () => import('lucide-react/dist/esm/icons/shopping-basket.js'),
  Pizza: () => import('lucide-react/dist/esm/icons/pizza.js'),
  Wine: () => import('lucide-react/dist/esm/icons/wine.js'),
  Beer: () => import('lucide-react/dist/esm/icons/beer.js'),
  Sandwich: () => import('lucide-react/dist/esm/icons/sandwich.js'),
  Salad: () => import('lucide-react/dist/esm/icons/salad.js'),
  IceCream: () => import('lucide-react/dist/esm/icons/ice-cream-cone.js'), // alias of «ice-cream-cone»
  CupSoda: () => import('lucide-react/dist/esm/icons/cup-soda.js'),
  Cookie: () => import('lucide-react/dist/esm/icons/cookie.js'),
  ChefHat: () => import('lucide-react/dist/esm/icons/chef-hat.js'),
  Home: () => import('lucide-react/dist/esm/icons/house.js'), // alias of «house»
  Key: () => import('lucide-react/dist/esm/icons/key.js'),
  Lightbulb: () => import('lucide-react/dist/esm/icons/lightbulb.js'),
  Wifi: () => import('lucide-react/dist/esm/icons/wifi.js'),
  Tv: () => import('lucide-react/dist/esm/icons/tv.js'),
  Wrench: () => import('lucide-react/dist/esm/icons/wrench.js'),
  Sofa: () => import('lucide-react/dist/esm/icons/sofa.js'),
  Plug: () => import('lucide-react/dist/esm/icons/plug.js'),
  Droplets: () => import('lucide-react/dist/esm/icons/droplets.js'),
  Flame: () => import('lucide-react/dist/esm/icons/flame.js'),
  Hammer: () => import('lucide-react/dist/esm/icons/hammer.js'),
  Shield: () => import('lucide-react/dist/esm/icons/shield.js'),
  Lock: () => import('lucide-react/dist/esm/icons/lock.js'),
  Thermometer: () => import('lucide-react/dist/esm/icons/thermometer.js'),
  Car: () => import('lucide-react/dist/esm/icons/car.js'),
  Bus: () => import('lucide-react/dist/esm/icons/bus.js'),
  Train: () => import('lucide-react/dist/esm/icons/tram-front.js'), // alias of «tram-front»
  Plane: () => import('lucide-react/dist/esm/icons/plane.js'),
  Fuel: () => import('lucide-react/dist/esm/icons/fuel.js'),
  ParkingSquare: () => import('lucide-react/dist/esm/icons/square-parking.js'), // alias of «square-parking»
  Bike: () => import('lucide-react/dist/esm/icons/bike.js'),
  MapPin: () => import('lucide-react/dist/esm/icons/map-pin.js'),
  Footprints: () => import('lucide-react/dist/esm/icons/footprints.js'),
  Sailboat: () => import('lucide-react/dist/esm/icons/sailboat.js'),
  HeartPulse: () => import('lucide-react/dist/esm/icons/heart-pulse.js'),
  Stethoscope: () => import('lucide-react/dist/esm/icons/stethoscope.js'),
  Pill: () => import('lucide-react/dist/esm/icons/pill.js'),
  Dumbbell: () => import('lucide-react/dist/esm/icons/dumbbell.js'),
  Activity: () => import('lucide-react/dist/esm/icons/activity.js'),
  Heart: () => import('lucide-react/dist/esm/icons/heart.js'),
  Brain: () => import('lucide-react/dist/esm/icons/brain.js'),
  Ambulance: () => import('lucide-react/dist/esm/icons/ambulance.js'),
  Music: () => import('lucide-react/dist/esm/icons/music.js'),
  Gamepad2: () => import('lucide-react/dist/esm/icons/gamepad-2.js'),
  Clapperboard: () => import('lucide-react/dist/esm/icons/clapperboard.js'),
  BookOpen: () => import('lucide-react/dist/esm/icons/book-open.js'),
  Camera: () => import('lucide-react/dist/esm/icons/camera.js'),
  Ticket: () => import('lucide-react/dist/esm/icons/ticket.js'),
  Theater: () => import('lucide-react/dist/esm/icons/theater.js'),
  Headphones: () => import('lucide-react/dist/esm/icons/headphones.js'),
  Popcorn: () => import('lucide-react/dist/esm/icons/popcorn.js'),
  Dice5: () => import('lucide-react/dist/esm/icons/dice-5.js'),
  Palette: () => import('lucide-react/dist/esm/icons/palette.js'),
  ShoppingCart: () => import('lucide-react/dist/esm/icons/shopping-cart.js'),
  ShoppingBag: () => import('lucide-react/dist/esm/icons/shopping-bag.js'),
  Shirt: () => import('lucide-react/dist/esm/icons/shirt.js'),
  Scissors: () => import('lucide-react/dist/esm/icons/scissors.js'),
  Gem: () => import('lucide-react/dist/esm/icons/gem.js'),
  Package: () => import('lucide-react/dist/esm/icons/package.js'),
  Backpack: () => import('lucide-react/dist/esm/icons/backpack.js'),
  Sparkles: () => import('lucide-react/dist/esm/icons/sparkles.js'),
  Watch: () => import('lucide-react/dist/esm/icons/watch.js'),
  Glasses: () => import('lucide-react/dist/esm/icons/glasses.js'),
  Globe: () => import('lucide-react/dist/esm/icons/globe.js'),
  Hotel: () => import('lucide-react/dist/esm/icons/hotel.js'),
  Luggage: () => import('lucide-react/dist/esm/icons/luggage.js'),
  Map: () => import('lucide-react/dist/esm/icons/map.js'),
  Compass: () => import('lucide-react/dist/esm/icons/compass.js'),
  Umbrella: () => import('lucide-react/dist/esm/icons/umbrella.js'),
  Mountain: () => import('lucide-react/dist/esm/icons/mountain.js'),
  Banknote: () => import('lucide-react/dist/esm/icons/banknote.js'),
  CreditCard: () => import('lucide-react/dist/esm/icons/credit-card.js'),
  TrendingUp: () => import('lucide-react/dist/esm/icons/trending-up.js'),
  TrendingDown: () => import('lucide-react/dist/esm/icons/trending-down.js'),
  PiggyBank: () => import('lucide-react/dist/esm/icons/piggy-bank.js'),
  Briefcase: () => import('lucide-react/dist/esm/icons/briefcase.js'),
  Building2: () => import('lucide-react/dist/esm/icons/building-2.js'),
  GraduationCap: () => import('lucide-react/dist/esm/icons/graduation-cap.js'),
  Laptop: () => import('lucide-react/dist/esm/icons/laptop.js'),
  Calculator: () => import('lucide-react/dist/esm/icons/calculator.js'),
  Receipt: () => import('lucide-react/dist/esm/icons/receipt.js'),
  Coins: () => import('lucide-react/dist/esm/icons/coins.js'),
  Percent: () => import('lucide-react/dist/esm/icons/percent.js'),
  HandCoins: () => import('lucide-react/dist/esm/icons/hand-coins.js'),
  Award: () => import('lucide-react/dist/esm/icons/award.js'),
  BadgeCheck: () => import('lucide-react/dist/esm/icons/badge-check.js'),
  BarChart2: () => import('lucide-react/dist/esm/icons/chart-no-axes-column.js'), // alias of «chart-no-axes-column»
  Landmark: () => import('lucide-react/dist/esm/icons/landmark.js'),
  Wallet: () => import('lucide-react/dist/esm/icons/wallet.js'),
  DollarSign: () => import('lucide-react/dist/esm/icons/dollar-sign.js'),
  CircleDollarSign: () => import('lucide-react/dist/esm/icons/circle-dollar-sign.js'),
  Zap: () => import('lucide-react/dist/esm/icons/zap.js'),
  Building: () => import('lucide-react/dist/esm/icons/building.js'),
  Baby: () => import('lucide-react/dist/esm/icons/baby.js'),
  Dog: () => import('lucide-react/dist/esm/icons/dog.js'),
  Users: () => import('lucide-react/dist/esm/icons/users.js'),
  Gift: () => import('lucide-react/dist/esm/icons/gift.js'),
  PartyPopper: () => import('lucide-react/dist/esm/icons/party-popper.js'),
  School: () => import('lucide-react/dist/esm/icons/school.js'),
  Candy: () => import('lucide-react/dist/esm/icons/candy.js'),
  Puzzle: () => import('lucide-react/dist/esm/icons/puzzle.js'),
  Smartphone: () => import('lucide-react/dist/esm/icons/smartphone.js'),
  Mail: () => import('lucide-react/dist/esm/icons/mail.js'),
  Monitor: () => import('lucide-react/dist/esm/icons/monitor.js'),
  Printer: () => import('lucide-react/dist/esm/icons/printer.js'),
  Play: () => import('lucide-react/dist/esm/icons/play.js'),
  Repeat: () => import('lucide-react/dist/esm/icons/repeat.js'),
  ShieldCheck: () => import('lucide-react/dist/esm/icons/shield-check.js'),
  ShieldAlert: () => import('lucide-react/dist/esm/icons/shield-alert.js'),
  ArrowLeftRight: () => import('lucide-react/dist/esm/icons/arrow-left-right.js'),
  Shuffle: () => import('lucide-react/dist/esm/icons/shuffle.js'),
  MoveRight: () => import('lucide-react/dist/esm/icons/move-right.js'),
  ChevronsLeftRight: () => import('lucide-react/dist/esm/icons/chevrons-left-right.js'),
  Tag: () => import('lucide-react/dist/esm/icons/tag.js'),
  Star: () => import('lucide-react/dist/esm/icons/star.js'),
  AlertCircle: () => import('lucide-react/dist/esm/icons/circle-alert.js'), // alias of «circle-alert»
  Archive: () => import('lucide-react/dist/esm/icons/archive.js'),
  Leaf: () => import('lucide-react/dist/esm/icons/leaf.js'),
  Sun: () => import('lucide-react/dist/esm/icons/sun.js'),
};
