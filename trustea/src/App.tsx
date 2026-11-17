import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowRight,
  BadgeCheck,
  Bell,
  BookOpen,
  Briefcase,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock3,
  Compass,
  CreditCard,
  FileCheck,
  Heart,
  LockKeyhole,
  LogIn,
  Menu,
  MessageCircle,
  Package,
  Plus,
  Receipt,
  Search,
  Send,
  Shield,
  ShoppingBag,
  Sparkles,
  Truck,
  MapPin,
  UserCheck,
  X,
} from 'lucide-react';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import { resolvePrivateMedia, uploadMedia } from './lib/media';
import MediaPicker from './MediaPicker';
import './media.css';

export type Creator = {
  id: string;
  user_id: string;
  display_name: string;
  handle: string;
  bio: string;
  avatar_url: string | null;
  is_published: boolean;
  creator_tiers?: Tier[];
};



export type Tier = {
  id: string;
  creator_id: string;
  name: string;
  amount: number;
  description: string;
};

type Post = {
  id: string;
  creator_id: string;
  title: string;
  body: string;
  image_url: string | null;
  visibility: 'public' | 'supporters';
  created_at: string;
  creator_profiles?: Pick<Creator, 'display_name' | 'handle'>;
};

export type Product = {
  id: string;
  creator_id: string;
  name: string;
  description: string;
  price: number;
  image_url: string | null;
  creator_profiles?: Pick<Creator, 'display_name' | 'handle'>;
};

type Mandate = {
  id: string;
  creator_id: string;
  tier_id: string;
  monthly_amount: number;
  status: 'pending_mfi' | 'approved' | 'active' | 'rejected' | 'cancelled';
  created_at: string;
  creator_profiles?: Pick<Creator, 'display_name' | 'handle'>;
  creator_tiers?: Pick<Tier, 'name'>;
};

type Order = {
  id: string;
  requester_id: string;
  product_id: string;
  creator_id: string;
  quantity: number;
  status: string;
  created_at: string;
  payment_authorization_id?: string | null;
  fulfilment_status?: string;
  fleetbase_status?: string | null;
  delivered_at?: string | null;
  fleetbase_tracking_url?: string | null;
  creator_products?: Pick<Product, 'name'>;
  creator_profiles?: Pick<Creator, 'display_name'>;
  return_request?: {
    id: string;
    reason: string;
    status: 'pending_mfi' | 'approved' | 'declined';
    requested_at: string;
    review_note: string | null;
  } | null;
};

type CreatorFulfilmentProfile = {
  creator_id: string;
  pickup_name: string;
  pickup_phone: string;
  pickup_address: string;
  pickup_latitude: number;
  pickup_longitude: number;
};

type ShopDeliveryDetails = {
  name: string;
  phone: string;
  address: string;
  latitude: number;
  longitude: number;
};

type CreatorSubscription = {
  id: string;
  creator_id: string;
  tier_id: string;
  expires_at: string;
  status: 'active' | 'cancelled';
  creator_profiles?: Pick<Creator, 'display_name' | 'handle'>;
  creator_tiers?: Pick<Tier, 'name'>;
};

type SalaryApplication = {
  id: string;
  applicant_first_name: string;
  applicant_last_name: string;
  employment_number: string;
  payslip_url: string | null;
  context_type: 'creator_support' | 'shop_order' | 'salary_facility';
  context_ref_id: string;
  context_label: string;
  amount: number;
  status: 'pending_mfi' | 'approved' | 'rejected';
  approved_limit?: number | null;
  pin_set_at?: string | null;
  created_at: string;
  reviewer_notes?: string | null;
};

export type SalaryAccount = {
  id?: string;
  firstName: string;
  lastName: string;
  nrcNumber: string;
  employmentNumber: string;
  employer: string;
  monthlySalary: number;
  phone: string;
  payslipUrl: string | null;
  status: 'linked' | 'pending_mfi' | 'unlinked';
  approvedLimit?: number | null;
  hasPin?: boolean;
  linkedAt?: string;
};

export type PendingIntent =
  | { type: 'donate'; tier: Tier; creator?: Creator }
  | { type: 'buy'; product: Product }
  | null;

export type DirectPayment = {
  id: string;
  title: string;
  recipient: string;
  recipientPhone?: string;
  note: string;
  amount: number;
  method: 'salary';
  status: 'authorized' | 'settled' | 'voided';
  paymentType: 'donation' | 'subscription' | 'shop_order';
  created_at: string;
  fulfilmentStatus?: string | null;
  trackingUrl?: string | null;
};

type PaymentAuthorizationRow = {
  id: string;
  payment_type: DirectPayment['paymentType'];
  amount: number;
  recipient_name: string | null;
  recipient_phone: string | null;
  note: string;
  status: DirectPayment['status'];
  created_at: string;
  creator_profiles?: Pick<Creator, 'display_name' | 'handle'> | null;
  creator_tiers?: Pick<Tier, 'name'> | null;
  creator_products?: Pick<Product, 'name'> | null;
};

export type PaySubTab = 'salary' | 'direct' | 'pledges' | 'history';

type Tab = 'discover' | 'library' | 'shop' | 'orders' | 'trustea' | 'pay' | 'studio';

/* ---------- preview data ---------- */
const previewCreators: Creator[] = [
  { id: 'preview-1', user_id: '', display_name: 'Nala Makes', handle: 'nalamakes', bio: 'A little color for your everyday. Art, prints & the stories behind them.', avatar_url: null, is_published: true, creator_tiers: [{ id: 'preview-tier-1', creator_id: 'preview-1', name: 'Studio friend', amount: 35, description: 'Studio notes, early looks, and a little thank-you.' }] },
  { id: 'preview-2', user_id: '', display_name: 'The Sunday Table', handle: 'sundaytable', bio: 'Recipes from home, made slowly and shared generously.', avatar_url: null, is_published: true, creator_tiers: [{ id: 'preview-tier-2', creator_id: 'preview-2', name: 'At the table', amount: 50, description: 'Monthly recipes and the stories behind them.' }] },
  { id: 'preview-3', user_id: '', display_name: 'Mwamba Sounds', handle: 'mwambasounds', bio: 'Independent music and notes from the studio in Lusaka.', avatar_url: null, is_published: true, creator_tiers: [{ id: 'preview-tier-3', creator_id: 'preview-3', name: 'Backstage pass', amount: 75, description: 'Demo drops, studio diaries, and early listens.' }] },
];
const previewPosts: Post[] = [
  { id: 'preview-post-1', creator_id: 'preview-1', title: 'Color from this morning', body: "A little sketch from the first quiet hour of the day. I've been thinking about how a small patch of sunlight can change a whole room.", image_url: null, visibility: 'public', created_at: '2026-10-28T08:30:00Z', creator_profiles: { display_name: 'Nala Makes', handle: 'nalamakes' } },
  { id: 'preview-post-2', creator_id: 'preview-2', title: 'The recipe I keep coming back to', body: 'Soft, warm, and made for sharing. This one has been on our table every Sunday lately.', image_url: null, visibility: 'public', created_at: '2026-10-27T10:00:00Z', creator_profiles: { display_name: 'The Sunday Table', handle: 'sundaytable' } },
  { id: 'preview-post-3', creator_id: 'preview-3', title: 'A note from the studio', body: "The new set is finding its shape. Here's a small behind-the-scenes listen while I put the last pieces together.", image_url: null, visibility: 'supporters', created_at: '2026-10-26T14:15:00Z', creator_profiles: { display_name: 'Mwamba Sounds', handle: 'mwambasounds' } },
];
const previewProducts: Product[] = [
  { id: 'preview-product-1', creator_id: 'preview-1', name: 'Little sunshine print', description: 'A warm, signed A4 art print for your favorite wall.', price: 180, image_url: null, creator_profiles: { display_name: 'Nala Makes', handle: 'nalamakes' } },
  { id: 'preview-product-2', creator_id: 'preview-2', name: 'Sunday recipe cards', description: 'A set of handwritten favorites, ready to share around.', price: 120, image_url: null, creator_profiles: { display_name: 'The Sunday Table', handle: 'sundaytable' } },
  { id: 'preview-product-3', creator_id: 'preview-3', name: 'Studio sessions vol. 1', description: 'A small-batch cassette of live room recordings.', price: 250, image_url: null, creator_profiles: { display_name: 'Mwamba Sounds', handle: 'mwambasounds' } },
];

const initials = (name = 'S') => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
const money = (value: number) => `ZMW ${Number(value).toFixed(0)}`;

/* ===================================================================
   ROOT APP
   =================================================================== */
import CreatorSharePage from './CreatorSharePage';
import TrusteaPage from './TrusteaPage';
import './orders.css';
import './creator-products.css';
import { shareLink } from './lib/share';

export default function App() {
  const [tab, setTab] = useState<Tab>(() => (
    new URLSearchParams(window.location.search).has('transaction') ? 'trustea' : 'discover'
  ));
  const [user, setUser] = useState<User | null>(null);
  const [creators, setCreators] = useState<Creator[]>(previewCreators);
  const [posts, setPosts] = useState<Post[]>(isSupabaseConfigured ? [] : previewPosts);
  const [products, setProducts] = useState<Product[]>(isSupabaseConfigured ? [] : previewProducts);
  const [mandates, setMandates] = useState<Mandate[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [creatorFulfilment, setCreatorFulfilment] = useState<CreatorFulfilmentProfile | null>(null);
  const [salaryApplications, setSalaryApplications] = useState<SalaryApplication[]>([]);
  const [myCreator, setMyCreator] = useState<Creator | null>(null);
  const [selectedCreator, setSelectedCreator] = useState<Creator | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [creatorFormOpen, setCreatorFormOpen] = useState(false);
  const [tierFormOpen, setTierFormOpen] = useState(false);
  const [postFormOpen, setPostFormOpen] = useState(false);
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [pickupFormOpen, setPickupFormOpen] = useState(false);
  const [shopCheckoutProduct, setShopCheckoutProduct] = useState<Product | null>(null);
  const [creatorImageFile, setCreatorImageFile] = useState<File | null>(null);
  const [postImageFile, setPostImageFile] = useState<File | null>(null);
  const [productImageFile, setProductImageFile] = useState<File | null>(null);

  /* ---------- pay tab & salary account state ---------- */
  const [paySubTab, setPaySubTab] = useState<PaySubTab>('salary');

  // --- Shareable creator page routing (hash based) ---
  const [shareSlug, setShareSlug] = useState<string | null>(null);
  const [shareProductId, setShareProductId] = useState<string | null>(null);
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash;
      const match = hash.match(/^#c\/([^/]+)(?:\/p\/([^/]+))?$/);
      setShareSlug(match ? decodeURIComponent(match[1]) : null);
      setShareProductId(match?.[2] ? decodeURIComponent(match[2]) : null);
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const [salaryAccount, setSalaryAccount] = useState<SalaryAccount | null>(null);
  const [pendingIntent, setPendingIntent] = useState<PendingIntent>(null);
  const [directPayments, setDirectPayments] = useState<DirectPayment[]>([]);
  const [subscriptions, setSubscriptions] = useState<CreatorSubscription[]>([]);

  const refreshData = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    setError('');
    const [creatorResult, tierResult, postResult, productResult] = await Promise.all([
      supabase.from('creator_profiles').select('*').eq('is_published', true).order('created_at', { ascending: false }),
      supabase.from('creator_tiers').select('*').eq('active', true),
      supabase.from('creator_posts').select('*, creator_profiles(display_name,handle)').order('created_at', { ascending: false }),
      supabase.from('creator_products').select('*, creator_profiles(display_name,handle)').eq('active', true).order('created_at', { ascending: false }),
    ]);

    const dataError = creatorResult.error || tierResult.error || postResult.error || productResult.error;
    if (dataError) throw dataError;

    const tiers = (tierResult.data || []) as Tier[];
    setCreators((creatorResult.data || []).map((creator) => ({
      ...creator,
      creator_tiers: tiers.filter((tier) => tier.creator_id === creator.id),
    })) as Creator[]);
    setPosts((postResult.data || []) as Post[]);
    setProducts((productResult.data || []) as Product[]);

    if (user) {
      const [profileResult, mandateResult, orderResult, salaryResult, paymentResult, subscriptionResult] = await Promise.all([
        supabase.from('creator_profiles').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('creator_support_mandates').select('*, creator_profiles(display_name,handle), creator_tiers(name)').order('created_at', { ascending: false }),
        supabase.from('creator_orders').select('*, creator_products(name), creator_profiles(display_name)').order('created_at', { ascending: false }),
        supabase.from('salary_applications').select('id, applicant_first_name, applicant_last_name, employment_number, payslip_url, context_type, context_ref_id, context_label, amount, status, approved_limit, pin_set_at, created_at, reviewer_notes, reviewed_at').order('created_at', { ascending: false }),
        supabase.from('salary_payment_authorizations').select('*, creator_profiles(display_name,handle), creator_tiers(name), creator_products(name)').order('created_at', { ascending: false }),
        supabase.from('creator_subscriptions').select('*, creator_profiles(display_name,handle), creator_tiers(name)').order('created_at', { ascending: false }),
      ]);
      const accountError = profileResult.error || mandateResult.error || orderResult.error || salaryResult.error || paymentResult.error || subscriptionResult.error;
      if (accountError) throw accountError;
      setMyCreator(profileResult.data as Creator | null);
      if (profileResult.data) {
        const { data: fulfilmentData, error: fulfilmentError } = await supabase
          .from('creator_fulfilment_profiles')
          .select('*')
          .eq('creator_id', profileResult.data.id)
          .maybeSingle();
        if (fulfilmentError) throw fulfilmentError;
        setCreatorFulfilment(fulfilmentData as CreatorFulfilmentProfile | null);
      } else {
        setCreatorFulfilment(null);
      }
      setMandates((mandateResult.data || []) as Mandate[]);
      const currentOrders = (orderResult.data || []) as Order[];
      const purchasedOrderIds = currentOrders
        .filter((order) => order.payment_authorization_id && order.requester_id === user.id)
        .map((order) => order.id);
      const returnRequestResult = purchasedOrderIds.length
        ? await supabase.from('creator_order_returns')
          .select('id, order_id, reason, status, requested_at, review_note')
          .in('order_id', purchasedOrderIds)
        : { data: [], error: null };
      if (returnRequestResult.error) throw returnRequestResult.error;
      const returnRequestsByOrder = new Map((returnRequestResult.data || []).map((request) => [request.order_id, request]));
      const ordersWithReturnRequests = currentOrders.map((order) => ({
        ...order,
        return_request: returnRequestsByOrder.get(order.id) || null,
      })) as Order[];
      const orderByAuthorization = new Map<string, Order>();
      for (const order of ordersWithReturnRequests) {
        if (order.payment_authorization_id) orderByAuthorization.set(order.payment_authorization_id, order);
      }
      setOrders(ordersWithReturnRequests);
      setSubscriptions((subscriptionResult.data || []) as CreatorSubscription[]);
      const apps = (salaryResult.data || []) as SalaryApplication[];
      setSalaryApplications(apps);

      // Restore or derive salary account from user profile/applications
      const userStorageKey = `sumthin_salary_account_${user.id}`;
      const userStoredRaw = localStorage.getItem(userStorageKey);
      let baseStored: SalaryAccount | null = null;
      if (userStoredRaw) {
        try {
          const parsed = JSON.parse(userStoredRaw) as SalaryAccount & { pinCode?: string };
          if (parsed.pinCode) {
            delete parsed.pinCode;
            localStorage.setItem(userStorageKey, JSON.stringify(parsed));
          }
          baseStored = parsed;
        } catch {
          // ignore
        }
      }

      const facilityApplications = apps.filter((application) => application.context_type === 'salary_facility');
      if (facilityApplications.length > 0) {
        const latest = facilityApplications[0];
        const derived: SalaryAccount = {
          id: latest.id,
          firstName: latest.applicant_first_name,
          lastName: latest.applicant_last_name,
          nrcNumber: baseStored?.nrcNumber || 'NRC on file',
          employmentNumber: latest.employment_number,
          employer: baseStored?.employer || 'Civil Service / Public Sector',
          monthlySalary: Number(latest.amount) || baseStored?.monthlySalary || 5000,
          phone: baseStored?.phone || '',
          payslipUrl: latest.payslip_url || baseStored?.payslipUrl || null,
          status: latest.status === 'rejected' ? 'unlinked' : latest.status === 'approved' ? 'linked' : 'pending_mfi',
          approvedLimit: latest.approved_limit != null ? Number(latest.approved_limit) : null,
          hasPin: Boolean(latest.pin_set_at),
          linkedAt: latest.created_at,
        };
        setSalaryAccount(derived);
        localStorage.setItem(`sumthin_salary_account_${user.id}`, JSON.stringify(derived));
      } else if (baseStored) {
        const unapprovedAccount = { ...baseStored, id: undefined, status: 'unlinked' as const, approvedLimit: null, hasPin: false };
        setSalaryAccount(unapprovedAccount);
        localStorage.setItem(userStorageKey, JSON.stringify(unapprovedAccount));
      } else {
        setSalaryAccount(null);
      }
      setDirectPayments(((paymentResult.data || []) as PaymentAuthorizationRow[]).map((payment) => ({
        id: payment.id,
        title: payment.payment_type === 'donation'
          ? `Donation to ${payment.recipient_name || 'recipient'}`
          : payment.payment_type === 'subscription'
            ? `Subscription: ${payment.creator_profiles?.display_name || 'creator'}`
            : `Order: ${payment.creator_products?.name || 'creator item'}`,
        recipient: payment.recipient_name || payment.creator_profiles?.display_name || payment.creator_products?.name || 'Creator',
        recipientPhone: payment.recipient_phone || undefined,
        note: payment.note,
        amount: Number(payment.amount),
        method: 'salary',
        paymentType: payment.payment_type,
        status: payment.status,
        created_at: payment.created_at,
        fulfilmentStatus: orderByAuthorization.get(payment.id)?.fulfilment_status || null,
        trackingUrl: orderByAuthorization.get(payment.id)?.fleetbase_tracking_url || null,
      })));
    } else {
      setMyCreator(null);
      setCreatorFulfilment(null);
      setMandates([]);
      setOrders([]);
      setSubscriptions([]);
      setDirectPayments([]);
      setSalaryApplications([]);
      setSalaryAccount(null);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) setError(sessionError.message);
      setUser(data.session?.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser((current) => {
        const nextUser = session?.user ?? null;
        return current?.id === nextUser?.id ? current : nextUser;
      });
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    setLoading(Boolean(supabase));
    refreshData().catch((loadError: Error) => {
      setError(loadError.message);
      setLoading(false);
    });
  }, [refreshData]);

  useEffect(() => {
    if (!supabase || !user) return;
    const client = supabase;
    const channel = client
      .channel(`salary-applications-${user.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'salary_applications',
        filter: `user_id=eq.${user.id}`,
      }, () => {
        refreshData().catch((loadError: Error) => setError(loadError.message));
      })
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [user, refreshData]);

  const visibleCreators = useMemo(() => creators.filter((creator) => (
    `${creator.display_name} ${creator.handle} ${creator.bio}`.toLowerCase().includes(search.toLowerCase())
  )), [creators, search]);

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 4500);
  };

  const shareCreator = async (creator: Creator) => {
    const url = `${window.location.origin}${window.location.pathname}#c/${encodeURIComponent(creator.handle)}`;
    try {
      const result = await shareLink(`${creator.display_name} on Trustea`, `Discover ${creator.display_name} on Trustea.`, url);
      if (result === 'shared') flash('Creator profile shared.');
      if (result === 'copied') flash('Creator profile link copied.');
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : 'Could not share this creator profile.');
    }
  };

  const shareProduct = async (product: Product) => {
    const creator = creators.find((item) => item.id === product.creator_id);
    if (!creator) {
      setError('Could not find this product’s creator profile to build a share link.');
      return;
    }
    const url = `${window.location.origin}${window.location.pathname}#c/${encodeURIComponent(creator.handle)}/p/${encodeURIComponent(product.id)}`;
    try {
      const result = await shareLink(product.name, `${product.name} by ${creator.display_name} on Trustea.`, url);
      if (result === 'shared') flash('Product shared.');
      if (result === 'copied') flash('Product link copied.');
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : 'Could not share this product.');
    }
  };

  const requireLogin = () => {
    if (user) return true;
    setAuthMode('signin');
    setAuthOpen(true);
    return false;
  };

  const signOut = async () => {
    if (!supabase) return;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) setError(signOutError.message);
    else flash('You are signed out.');
  };

  const handleAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') || '');
    const password = String(form.get('password') || '');
    setBusy(true);
    setError('');
    const result = authMode === 'signup'
      ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
      : await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setAuthOpen(false);
    if (authMode === 'signup' && !result.data.session) {
      flash('Check your email to confirm your account, then come back to sign in.');
    } else {
      flash(authMode === 'signup' ? 'Welcome to Trustea!' : "You're back. Good to have you.");
    }
  };

  /* ---------- PIN modal state ---------- */
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinModalMode, setPinModalMode] = useState<'setup' | 'verify'>('verify');
  const [pinError, setPinError] = useState('');
  const [pinTargetAction, setPinTargetAction] = useState<((pin: string) => Promise<boolean>) | null>(null);
  const [pinActionLabel, setPinActionLabel] = useState<{ title: string; subtitle: string; amount?: number }>({
    title: 'Confirm Payment',
    subtitle: 'Enter your 4-digit PIN to authorize payment.',
  });

  const setupPaymentPin = async (pin: string) => {
    if (!supabase || !user || !salaryAccount?.id || salaryAccount.status !== 'linked' || !salaryAccount.approvedLimit) {
      setPinError('An approved salary facility is required before setting a payment PIN.');
      return false;
    }
    setBusy(true);
    setPinError('');
    const { data, error: rpcError } = await supabase.rpc('set_salary_payment_pin', {
      p_application_id: salaryAccount.id,
      p_pin: pin,
    });
    setBusy(false);
    if (rpcError) {
      setPinError(rpcError.message);
      return false;
    }
    if (data?.success !== true) {
      setPinError(data?.error || 'Failed to configure payment PIN.');
      return false;
    }

    const updatedAccount = { ...salaryAccount, hasPin: true };
    setSalaryAccount(updatedAccount);
    localStorage.setItem(`sumthin_salary_account_${user.id}`, JSON.stringify(updatedAccount));
    flash('Payment PIN configured successfully!');
    return true;
  };

  const submitPaymentPin = async (pin: string) => {
    setPinError('');
    if (pinModalMode === 'setup') {
      if (!(await setupPaymentPin(pin))) return false;
      setPinModalMode('verify');
      setPinActionLabel((current) => ({
        ...current,
        title: current.title.replace(' · create PIN', ''),
        subtitle: 'Your PIN is set. Enter it to authorize the payment.',
      }));
    }
    if (pinTargetAction && !(await pinTargetAction(pin))) return false;

    setPinModalOpen(false);
    setPinTargetAction(null);
    return true;
  };

  const authorizeSalaryPayment = async (
    payload: {
      paymentType: DirectPayment['paymentType'];
      amount?: number;
      recipientName?: string;
      recipientPhone?: string;
      note?: string;
      tierId?: string;
      productId?: string;
      quantity?: number;
      delivery?: ShopDeliveryDetails;
    },
    pin: string,
  ) => {
    if (!supabase || !user) {
      setPinError('Sign in before authorizing a payment.');
      return false;
    }
    setBusy(true);
    setPinError('');
    const requestId = crypto.randomUUID();
    const authorizationResult = payload.paymentType === 'shop_order' && payload.delivery
      ? await supabase.rpc('authorize_creator_shop_order', {
          p_request_id: requestId,
          p_pin: pin,
          p_product_id: payload.productId ?? null,
          p_quantity: payload.quantity ?? 1,
          p_delivery_name: payload.delivery.name,
          p_delivery_phone: payload.delivery.phone,
          p_delivery_address: payload.delivery.address,
          p_delivery_latitude: payload.delivery.latitude,
          p_delivery_longitude: payload.delivery.longitude,
        })
      : payload.paymentType === 'shop_order'
        ? { data: { success: false, error: 'Delivery details are required for shop purchases.' }, error: null }
        : await supabase.rpc('authorize_salary_payment', {
            p_request_id: requestId,
            p_payment_type: payload.paymentType,
            p_pin: pin,
            p_amount: payload.amount ?? null,
            p_recipient_name: payload.recipientName ?? null,
            p_recipient_phone: payload.recipientPhone ?? null,
            p_note: payload.note || '',
            p_tier_id: payload.tierId ?? null,
            p_product_id: payload.productId ?? null,
            p_quantity: payload.quantity ?? 1,
          });
    setBusy(false);
    if (authorizationResult.error) {
      setPinError(authorizationResult.error.message);
      return false;
    }
    if (authorizationResult.data?.success !== true) {
      setPinError(authorizationResult.data?.error || 'Payment could not be authorized.');
      return false;
    }
    flash(payload.paymentType === 'shop_order'
      ? `Payment authorized for ${money(Number(authorizationResult.data.amount))}. Awaiting MFI approval and delivery.`
      : `Payment authorized for ${money(Number(authorizationResult.data.amount))}. Awaiting MFI settlement.`);
    refreshData().catch((loadError: Error) => setError(loadError.message));
    return true;
  };

  const createCreator = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !user) return;
    const form = new FormData(event.currentTarget);
    const displayName = String(form.get('display_name') || '').trim();
    const handle = String(form.get('handle') || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    setBusy(true);
    setError('');
    try {
      const avatar = creatorImageFile ? await uploadMedia(creatorImageFile, 'avatar') : null;
      const { error: createError } = await supabase.from('creator_profiles').insert({
        user_id: user.id,
        display_name: displayName,
        handle,
        bio: String(form.get('bio') || '').trim(),
        avatar_url: avatar?.url || null,
        is_published: true,
      });
      if (createError) {
        setError(createError.message);
        return;
      }
      setCreatorFormOpen(false);
      setCreatorImageFile(null);
      flash('Your creator page is live.');
      refreshData().catch((loadError: Error) => setError(loadError.message));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Creator image upload failed.');
    } finally {
      setBusy(false);
    }
  };

  const createTier = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !user || !myCreator) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    const { error: tierError } = await supabase.from('creator_tiers').insert({
      creator_id: myCreator.id,
      name: String(form.get('name') || '').trim(),
      amount: Number(form.get('amount')),
      description: String(form.get('description') || '').trim(),
    });
    setBusy(false);
    if (tierError) setError(tierError.message);
    else {
      setTierFormOpen(false);
      flash('Support tier added.');
      refreshData().catch((loadError: Error) => setError(loadError.message));
    }
  };

  const createPost = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !myCreator) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const visibility = String(form.get('visibility') || 'supporters') as Post['visibility'];
      const uploadedImage = postImageFile
        ? await uploadMedia(postImageFile, visibility === 'supporters' ? 'post-supporters' : 'post-public', myCreator.id)
        : null;
      const { error: postError } = await supabase.from('creator_posts').insert({
        creator_id: myCreator.id,
        title: String(form.get('title') || '').trim(),
        body: String(form.get('body') || '').trim(),
        visibility,
        image_url: uploadedImage ? uploadedImage.url || `r2://${uploadedImage.key}` : null,
      });
      if (postError) {
        setError(postError.message);
        return;
      }
      setPostFormOpen(false);
      setPostImageFile(null);
      flash('Your post is published.');
      refreshData().catch((loadError: Error) => setError(loadError.message));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Post image upload failed.');
    } finally {
      setBusy(false);
    }
  };

  const createProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !myCreator) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const uploadedImage = productImageFile ? await uploadMedia(productImageFile, 'product-image') : null;
      const { error: productError } = await supabase.from('creator_products').insert({
        creator_id: myCreator.id,
        name: String(form.get('name') || '').trim(),
        description: String(form.get('description') || '').trim(),
        price: Number(form.get('price')),
        image_url: uploadedImage?.url || null,
      });
      if (productError) {
        setError(productError.message);
        return;
      }
      setProductFormOpen(false);
      setProductImageFile(null);
      flash('Your item is in the shop.');
      refreshData().catch((loadError: Error) => setError(loadError.message));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Product image upload failed.');
    } finally {
      setBusy(false);
    }
  };

  const hasValidAccount = useCallback(() => {
    return Boolean(
      user
      && salaryAccount?.status === 'linked'
      && salaryAccount.approvedLimit
      && salaryAccount.approvedLimit > 0
    );
  }, [user, salaryAccount]);

  const promptPinOrSetup = (actionLabel: { title: string; subtitle: string; amount?: number }, onConfirm: (pin: string) => Promise<boolean>) => {
    setError('');
    setPinError('');
    if (!salaryAccount?.hasPin) {
      setPinModalMode('setup');
      setPinActionLabel({
        title: `${actionLabel.title} · create PIN`,
        subtitle: `${actionLabel.subtitle}. Choose a 4-digit PIN to authorize this payment and future payments.`,
        amount: actionLabel.amount,
      });
    } else {
      setPinModalMode('verify');
      setPinActionLabel(actionLabel);
    }
    setPinTargetAction(() => onConfirm);
    setPinModalOpen(true);
  };

  const handleDonate = (tier: Tier, creatorOverride?: Creator) => {
    const creator = creatorOverride || creators.find((c) => c.id === tier.creator_id) || selectedCreator || undefined;
    if (!user) {
      requireLogin();
      return;
    }
    if (!hasValidAccount()) {
      setPendingIntent({ type: 'donate', tier, creator });
      setPaySubTab('salary');
      setTab('pay');
      setSelectedCreator(null);
      flash('Apply for a salary facility and wait for MFI approval before supporting creators.');
      return;
    }

    promptPinOrSetup(
      {
        title: `Confirm one-month subscription`,
        subtitle: `${creator?.display_name || 'Creator'} · ${tier.name} · ${money(Number(tier.amount))} for one month`,
        amount: tier.amount,
      },
      (pin) => authorizeSalaryPayment({ paymentType: 'subscription', tierId: tier.id }, pin),
    );
  };

  const handleBuy = (product: Product) => {
    if (!user) {
      requireLogin();
      return;
    }
    if (!hasValidAccount()) {
      setPendingIntent({ type: 'buy', product });
      setPaySubTab('salary');
      setTab('pay');
      setSelectedCreator(null);
      flash('Apply for a salary facility and wait for MFI approval before buying items.');
      return;
    }

    setShopCheckoutProduct(product);
  };

  const submitShopCheckout = (event: FormEvent<HTMLFormElement>, product: Product) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const delivery: ShopDeliveryDetails = {
      name: String(form.get('deliveryName') || '').trim(),
      phone: String(form.get('deliveryPhone') || '').trim(),
      address: String(form.get('deliveryAddress') || '').trim(),
      latitude: Number(form.get('deliveryLatitude')),
      longitude: Number(form.get('deliveryLongitude')),
    };
    setShopCheckoutProduct(null);
    promptPinOrSetup(
      {
        title: 'Confirm shop purchase',
        subtitle: `${product.name} · ${money(Number(product.price))}. MFI approval is required before Fleetbase delivery.`,
        amount: product.price,
      },
      (pin) => authorizeSalaryPayment({ paymentType: 'shop_order', productId: product.id, delivery }, pin),
    );
  };

  const saveCreatorPickup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !user || !myCreator) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    const { error: saveError } = await supabase.from('creator_fulfilment_profiles').upsert({
      creator_id: myCreator.id,
      pickup_name: String(form.get('pickupName') || '').trim(),
      pickup_phone: String(form.get('pickupPhone') || '').trim(),
      pickup_address: String(form.get('pickupAddress') || '').trim(),
      pickup_latitude: Number(form.get('pickupLatitude')),
      pickup_longitude: Number(form.get('pickupLongitude')),
      updated_at: new Date().toISOString(),
    });
    setBusy(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setPickupFormOpen(false);
    flash('Your shop pickup details are saved.');
    refreshData().catch((loadError: Error) => setError(loadError.message));
  };

  const handleRegisterSalary = async (details: {
    firstName: string;
    lastName: string;
    nrcNumber: string;
    employmentNumber: string;
    employer: string;
    monthlySalary: number;
    phone: string;
    payslipFile: File | null;
  }): Promise<boolean> => {
    if (!supabase || !user) {
      setError('Sign in before submitting a salary facility application.');
      requireLogin();
      return false;
    }
    setBusy(true);
    setError('');

    let payslipUrl: string | null = null;
    if (details.payslipFile) {
      try {
        const upload = await uploadMedia(details.payslipFile, 'salary-payslip');
        payslipUrl = `r2://${upload.key}`;
      } catch (uploadError) {
        setBusy(false);
        setError(uploadError instanceof Error ? `Payslip upload failed: ${uploadError.message}` : 'Payslip upload failed.');
        return false;
      }
    }

    const { error: insertError } = await supabase.from('salary_applications').insert({
      user_id: user.id,
      applicant_first_name: details.firstName,
      applicant_last_name: details.lastName,
      employment_number: details.employmentNumber,
      payslip_url: payslipUrl,
      context_type: 'salary_facility',
      context_ref_id: 'salary_facility',
      context_label: `Salary facility application — ${details.employer}`,
      amount: details.monthlySalary,
      status: 'pending_mfi',
    });
    if (insertError) {
      setBusy(false);
      setError(insertError.message);
      return false;
    }

    const newAccount: SalaryAccount = {
      id: undefined,
      firstName: details.firstName,
      lastName: details.lastName,
      nrcNumber: details.nrcNumber,
      employmentNumber: details.employmentNumber,
      employer: details.employer,
      monthlySalary: details.monthlySalary,
      phone: details.phone,
      payslipUrl,
      status: 'pending_mfi',
      hasPin: false,
      linkedAt: new Date().toISOString(),
    };

    setSalaryAccount(newAccount);
    localStorage.setItem(`sumthin_salary_account_${user.id}`, JSON.stringify(newAccount));
    setBusy(false);
    flash('Salary facility application submitted. MFI will assess eligibility and set your limit.');
    await refreshData();
    return true;
  };

  const handleDirectPayment = (params: {
    recipientName: string;
    recipientPhone?: string;
    amount: number;
    note: string;
  }) => {
    if (!user) {
      requireLogin();
      return;
    }
    if (!hasValidAccount()) {
      setPaySubTab('salary');
      flash('An MFI-approved salary facility is required before making a payment.');
      return;
    }
    promptPinOrSetup(
      {
        title: 'Confirm donation',
        subtitle: `${money(params.amount)} to ${params.recipientName}`,
        amount: params.amount,
      },
      (pin) => authorizeSalaryPayment({
        paymentType: 'donation',
        amount: params.amount,
        recipientName: params.recipientName,
        recipientPhone: params.recipientPhone,
        note: params.note,
      }, pin),
    );
  };

  const handleCancelMandate = async (mandateId: string) => {
    if (!supabase || !user) return;
    setBusy(true);
    const { error: cancelError } = await supabase
      .from('creator_support_mandates')
      .update({ status: 'cancelled' })
      .eq('id', mandateId)
      .eq('supporter_id', user.id);
    setBusy(false);
    if (cancelError) {
      setError(cancelError.message);
    } else {
      flash('Creator support pledge cancelled.');
      await refreshData();
    }
  };

  const updateOrderStatus = async (orderId: string, status: 'accepted' | 'declined') => {
    if (!supabase) return;
    setBusy(true);
    setError('');
    const { data, error: updateError } = await supabase
      .from('creator_orders')
      .update({ status })
      .eq('id', orderId)
      .eq('status', 'requested')
      .select('id')
      .maybeSingle();
    setBusy(false);
    if (updateError) setError(updateError.message);
    else if (!data) setError('This order request is no longer waiting for a response.');
    else {
      flash(status === 'accepted' ? 'Order request accepted.' : 'Order request declined.');
      refreshData().catch((loadError: Error) => setError(loadError.message));
    }
  };

  const requestOrderReturn = async (orderId: string, reason: string): Promise<boolean> => {
    if (!supabase || !user) {
      requireLogin();
      return false;
    }
    setBusy(true);
    setError('');
    try {
      const { data, error: returnError } = await supabase.rpc('request_creator_order_return', {
        p_order_id: orderId,
        p_reason: reason,
      });
      if (returnError) {
        setError(returnError.message);
        return false;
      }
      if (data?.success !== true) {
        setError(data?.error || 'Could not submit the return request.');
        return false;
      }
      flash('Return request sent to MFI for review.');
      try {
        await refreshData();
      } catch (loadError) {
        setError(loadError instanceof Error ? `Return request sent, but orders could not be refreshed: ${loadError.message}` : 'Return request sent, but orders could not be refreshed.');
      }
      return true;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not submit the return request.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const navItems: { id: Tab; label: string; icon: typeof Compass }[] = [
    { id: 'discover', label: 'Discover', icon: Compass },
    { id: 'library', label: 'Your people', icon: Heart },
    { id: 'shop', label: 'Shop', icon: ShoppingBag },
    { id: 'orders', label: 'Orders', icon: Package },
    { id: 'trustea', label: 'BuySafe', icon: Shield },
    { id: 'pay', label: 'Pay', icon: CreditCard },
    { id: 'studio', label: 'Studio', icon: Sparkles },
  ];

  /* ---- pending salary apps count for library badge ---- */
  const pendingSalaryCount = salaryApplications.filter((a) => a.status === 'pending_mfi').length;

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="wordmark" onClick={() => { setTab('discover'); setSelectedCreator(null); }} aria-label="Trustea home">
          Trustea<span className="wordmark-dot">.</span>
        </button>
        <div className="top-search">
          <Search size={17} />
          <input aria-label="Search creators" placeholder="Find your next favorite..." value={search} onChange={(event) => setSearch(event.target.value)} />
          <span className="search-shortcut">/</span>
        </div>
        <div className="top-actions">
          <button className="icon-button notification-button" aria-label="Updates"><Bell size={19} /><i /></button>
          {user ? (
            <button className="account-button" onClick={signOut}>
              <span className="avatar avatar-small">{initials(user.email || 'You')}</span>
              <span className="account-name">{user.email?.split('@')[0]}</span>
              <ChevronDown size={15} />
            </button>
          ) : (
            <button className="sign-in-button" onClick={() => { setAuthMode('signin'); setAuthOpen(true); }}>Log in <ArrowRight size={15} /></button>
          )}
        </div>
      </header>

      <div className="mobile-search">
        <Search size={17} />
        <input aria-label="Search creators" placeholder="Find your next favorite..." value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>

      <div className="app-layout">
        <aside className="sidebar">
          <div className="side-label">YOUR SPACE</div>
          {navItems.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`side-link ${tab === id ? 'selected' : ''}`} onClick={() => { setTab(id); setSelectedCreator(null); }}>
              <Icon size={18} strokeWidth={tab === id ? 2.4 : 1.8} /><span>{label}</span>
              {id === 'library' && (mandates.some((item) => item.status === 'active') || pendingSalaryCount > 0) && (
                <span className="side-count">{mandates.filter((item) => item.status === 'active').length + pendingSalaryCount}</span>
              )}
              {id === 'pay' && !salaryAccount && (
                <span className="side-count pay-link-pill">Link</span>
              )}
              {id === 'pay' && salaryAccount && pendingSalaryCount > 0 && (
                <span className="side-count">{pendingSalaryCount}</span>
              )}
            </button>
          ))}
          <div className="sidebar-divider" />
          <button className="side-link creator-link" onClick={() => { setTab('studio'); setSelectedCreator(null); }}>
            <Plus size={18} /><span>Start creating</span>
          </button>
          <div className="sidebar-note">
            <div className="note-icon"><Heart size={16} fill="currentColor" /></div>
            <p>Good things happen when we show up for each other.</p>
            <button onClick={() => setTab('discover')}>Meet the community <ArrowRight size={13} /></button>
          </div>
          <div className="sidebar-bottom">
            <CircleHelp size={15} /> Made for the people who make things.
          </div>
        </aside>

        <main className="main-content">
          {!isSupabaseConfigured && (
            <div className="preview-banner">
              <Sparkles size={16} /><span>Preview mode — connect Supabase to sign in and save changes.</span>
              <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">Setup <ArrowRight size={13} /></a>
            </div>
          )}
          {error && <div className="error-banner" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}><X size={15} /></button></div>}
          {loading ? (
            <div className="loading-state"><div className="spinner" /><p>Making a little space...</p></div>
          ) : (
            <>
              {shareSlug ? (
                <CreatorSharePage slug={shareSlug} productId={shareProductId} onOrder={handleBuy} />
              ) : (
              <>
                {tab === 'discover' && (
                  selectedCreator ? (
                    <CreatorPage
                      creator={selectedCreator}
                      posts={posts.filter((post) => post.creator_id === selectedCreator.id)}
                      products={products.filter((product) => product.creator_id === selectedCreator.id)}
                      onBack={() => setSelectedCreator(null)}
                      onSupport={handleDonate}
                      onOrder={handleBuy}
                      onShareProfile={shareCreator}
                      onShareProduct={shareProduct}
                      user={user}
                    />
                  ) : (
                    <DiscoverPage creators={visibleCreators} posts={posts.filter((post) => post.visibility === 'public' || mandates.some((item) => item.creator_id === post.creator_id && item.status === 'active') || subscriptions.some((item) => item.creator_id === post.creator_id && item.status === 'active' && new Date(item.expires_at) > new Date()))} onSelect={setSelectedCreator} onSupport={handleDonate} user={user} />
                  )
                )}
                {tab === 'library' && (
                    <LibraryPage mandates={mandates} subscriptions={subscriptions} salaryApplications={salaryApplications} posts={posts.filter((post) => post.visibility === 'supporters' && (mandates.some((item) => item.creator_id === post.creator_id && item.status === 'active') || subscriptions.some((item) => item.creator_id === post.creator_id && item.status === 'active' && new Date(item.expires_at) > new Date())))} onDiscover={() => setTab('discover')} />
                )}
                {tab === 'shop' && (
                  <ShopPage products={products} onOrder={handleBuy} onShareProduct={shareProduct} configured={isSupabaseConfigured} />
                )}
                {tab === 'orders' && (
                  <OrdersPage
                    orders={orders.filter((order) => order.payment_authorization_id && order.requester_id === user?.id)}
                    user={user}
                    busy={busy}
                    onLogin={requireLogin}
                    onRequestReturn={requestOrderReturn}
                  />
                )}
                {tab === 'trustea' && <TrusteaPage user={user} onLogin={requireLogin} />}
                {tab === 'pay' && (
                  <PayPage
                    user={user}
                    salaryAccount={salaryAccount}
                    mandates={mandates}
                    subscriptions={subscriptions}
                    salaryApplications={salaryApplications}
                    orders={orders}
                    directPayments={directPayments}
                    creators={creators}
                    configured={isSupabaseConfigured}
                    busy={busy}
                    subTab={paySubTab}
                    onSubTabChange={setPaySubTab}
                    pendingIntent={pendingIntent}
                    onClearPendingIntent={() => setPendingIntent(null)}
                    onCompletePendingIntent={() => {
                      if (!pendingIntent) return;
                      const intent = pendingIntent;
                      setPendingIntent(null);
                      if (intent.type === 'donate') handleDonate(intent.tier, intent.creator);
                      else handleBuy(intent.product);
                    }}
                    onRegisterSalary={handleRegisterSalary}
                    onDirectPayment={handleDirectPayment}
                    onCancelMandate={handleCancelMandate}
                    onLogin={requireLogin}
                    hasValidAccount={hasValidAccount()}
                    onPromptPinSetup={() => {
                      setError('');
                      setPinError('');
                      setPinModalMode('setup');
                      setPinActionLabel({
                        title: 'Create your Payment PIN',
                        subtitle: 'Choose a 4-digit PIN for instant 1-click authorizations.',
                      });
                      setPinTargetAction(null);
                      setPinModalOpen(true);
                    }}
                  />
                )}
                {tab === 'studio' && (
                  <StudioPage
                    user={user}
                    creator={myCreator}
                    creatorFulfilment={creatorFulfilment}
                    busy={busy}
                    posts={posts.filter((post) => post.creator_id === myCreator?.id)}
                    products={products.filter((product) => product.creator_id === myCreator?.id)}
                    orders={orders}
                    onLogin={requireLogin}
                    onCreateProfile={() => setCreatorFormOpen(true)}
                    onCreatePost={() => setPostFormOpen(true)}
                    onCreateProduct={() => setProductFormOpen(true)}
                    onCreateTier={() => setTierFormOpen(true)}
                    onEditPickup={() => setPickupFormOpen(true)}
                    onOrderStatusChange={updateOrderStatus}
                    onShareProfile={shareCreator}
                  />
                )}
              </>
            )}
            </>
          )}
        </main>
      </div>

      <nav className="mobile-nav">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => { setTab(id); setSelectedCreator(null); }}>
            <Icon size={20} /><span>{label}</span>
          </button>
        ))}
      </nav>

      {notice && <div className="toast"><span className="toast-check"><Check size={14} /></span>{notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><X size={15} /></button></div>}

      {pinModalOpen && (
        <PaymentPinModal
          mode={pinModalMode}
          title={pinActionLabel.title}
          subtitle={pinActionLabel.subtitle}
          amount={pinActionLabel.amount}
          busy={busy}
          error={pinError}
          onClose={() => {
            setPinModalOpen(false);
            setPinTargetAction(null);
            setPinError('');
          }}
          onSubmit={submitPaymentPin}
        />
      )}

      {/* ── Auth modal ── */}
      {authOpen && <Modal onClose={() => setAuthOpen(false)}>
        <div className="modal-icon"><LogIn size={21} /></div>
        <h2>{authMode === 'signin' ? 'Good to have you back.' : 'Make yourself at home.'}</h2>
        <p className="modal-copy">{authMode === 'signin' ? 'Log in to find your people and support the work you love.' : 'Create an account to follow creators and share your own work.'}</p>
        <form className="form-stack" onSubmit={handleAuth}>
          <label>Email address<input name="email" type="email" placeholder="you@example.com" autoComplete="email" required /></label>
          <label>Password<input name="password" type="password" minLength={8} placeholder="At least 8 characters" autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'} required /></label>
          <button className="button button-dark full-button" disabled={busy}>{busy ? 'One moment…' : authMode === 'signin' ? 'Log in' : 'Create account'} <ArrowRight size={16} /></button>
        </form>
        <div className="auth-switch">{authMode === 'signin' ? 'New around here?' : 'Already part of the crew?'} <button onClick={() => { setError(''); setAuthMode(authMode === 'signin' ? 'signup' : 'signin'); }}>{authMode === 'signin' ? 'Create an account' : 'Log in'}</button></div>
        {!isSupabaseConfigured && <div className="form-message">Add your Supabase URL and anon key to enable accounts.</div>}
      </Modal>}

      {/* ── Creator profile form ── */}
      {creatorFormOpen && <Modal onClose={() => { setCreatorFormOpen(false); setCreatorImageFile(null); }}>
        <div className="modal-icon violet"><Sparkles size={20} /></div><h2>Your corner of the internet.</h2><p className="modal-copy">A name, a handle, and a little about what you make.</p>
        <form className="form-stack" onSubmit={createCreator}>
          <label>Creator name<input name="display_name" maxLength={70} required /></label>
          <label>Handle<input name="handle" pattern="[A-Za-z0-9_]{3,30}" minLength={3} maxLength={30} placeholder="yourname" required /></label>
          <label>What do you make?<textarea name="bio" maxLength={400} rows={3} required /></label>
          <MediaPicker label="Profile photo (optional)" file={creatorImageFile} onChange={setCreatorImageFile} />
          <button className="button button-dark full-button" disabled={busy || !isSupabaseConfigured}>{busy ? 'Setting up…' : 'Publish my page'} <ArrowRight size={16} /></button>
        </form>
      </Modal>}

      {/* ── Tier form ── */}
      {tierFormOpen && <Modal onClose={() => setTierFormOpen(false)}>
        <div className="modal-icon peach"><Heart size={20} /></div><h2>Make room for your people.</h2><p className="modal-copy">Set a monthly amount for supporters. The MFI reviews each deduction request.</p>
        <form className="form-stack" onSubmit={createTier}>
          <label>Tier name<input name="name" maxLength={70} placeholder="Studio friend" required /></label>
          <label>Monthly amount (ZMW)<input name="amount" type="number" min="1" step="0.01" required /></label>
          <label>What do supporters get?<textarea name="description" maxLength={400} rows={3} required /></label>
          <button className="button button-dark full-button" disabled={busy || !isSupabaseConfigured}>{busy ? 'Saving…' : 'Publish support tier'} <ArrowRight size={16} /></button>
        </form>
      </Modal>}

      {/* ── Post form ── */}
      {postFormOpen && <Modal onClose={() => { setPostFormOpen(false); setPostImageFile(null); }}>
        <div className="modal-icon violet"><BookOpen size={20} /></div><h2>Share something good.</h2>
        <form className="form-stack" onSubmit={createPost}>
          <label>Post title<input name="title" maxLength={120} required /></label>
          <label>Your post<textarea name="body" maxLength={6000} rows={5} required /></label>
          <MediaPicker label="Post image (optional)" file={postImageFile} onChange={setPostImageFile} />
          <label>Who can see it?<select name="visibility"><option value="supporters">Supporters only</option><option value="public">Everyone</option></select></label>
          <button className="button button-dark full-button" disabled={busy || !isSupabaseConfigured}>{busy ? 'Publishing…' : 'Publish post'} <ArrowRight size={16} /></button>
        </form>
      </Modal>}

      {/* ── Product form ── */}
      {productFormOpen && <Modal onClose={() => { setProductFormOpen(false); setProductImageFile(null); }}>
        <div className="modal-icon peach"><Package size={20} /></div><h2>Put a little something in the shop.</h2>
        <form className="form-stack" onSubmit={createProduct}>
          <label>Item name<input name="name" maxLength={100} required /></label>
          <label>Description<textarea name="description" maxLength={1000} rows={3} required /></label>
          <label>Price (ZMW)<input name="price" type="number" min="1" step="0.01" required /></label>
          <MediaPicker label="Item image (optional)" file={productImageFile} onChange={setProductImageFile} />
          <button className="button button-dark full-button" disabled={busy || !isSupabaseConfigured}>{busy ? 'Adding…' : 'Add to shop'} <ArrowRight size={16} /></button>
        </form>
      </Modal>}
      {pickupFormOpen && myCreator && <Modal onClose={() => setPickupFormOpen(false)}>
        <div className="modal-icon violet"><Package size={20} /></div><h2>Set your shop pickup details.</h2>
        <p className="modal-copy">MFI sends approved physical orders to Fleetbase for delivery from this pickup location to the buyer.</p>
        <form className="form-stack" onSubmit={saveCreatorPickup}>
          <label>Pickup contact name<input name="pickupName" maxLength={100} defaultValue={creatorFulfilment?.pickup_name || myCreator.display_name} required /></label>
          <label>Pickup phone<input name="pickupPhone" type="tel" maxLength={20} defaultValue={creatorFulfilment?.pickup_phone || ''} required /></label>
          <label>Pickup address<input name="pickupAddress" maxLength={500} defaultValue={creatorFulfilment?.pickup_address || ''} placeholder="Street, area, city" required /></label>
          <CoordinatesFields
            latitudeName="pickupLatitude"
            longitudeName="pickupLongitude"
            initialLatitude={creatorFulfilment?.pickup_latitude}
            initialLongitude={creatorFulfilment?.pickup_longitude}
          />
          <button className="button button-dark full-button" disabled={busy}>{busy ? 'Saving…' : 'Save pickup details'} <ArrowRight size={16} /></button>
        </form>
      </Modal>}
      {shopCheckoutProduct && <Modal onClose={() => setShopCheckoutProduct(null)}>
        <div className="modal-icon peach"><Truck size={20} /></div><h2>Where should we deliver it?</h2>
        <p className="modal-copy">{shopCheckoutProduct.name} · {money(Number(shopCheckoutProduct.price))}. MFI approval is required before Fleetbase arranges delivery.</p>
        <form className="form-stack" onSubmit={(event) => submitShopCheckout(event, shopCheckoutProduct)}>
          <label>Recipient name<input name="deliveryName" maxLength={100} autoComplete="name" required /></label>
          <label>Delivery phone<input name="deliveryPhone" type="tel" maxLength={20} autoComplete="tel" required /></label>
          <label>Delivery address<input name="deliveryAddress" maxLength={500} placeholder="Street, area, city, any delivery instructions" autoComplete="street-address" required /></label>
          <CoordinatesFields latitudeName="deliveryLatitude" longitudeName="deliveryLongitude" />
          <div className="form-info-strip"><MapPin size={14} /> Allow location access at the delivery address so Fleetbase can route to the correct destination.</div>
          <button className="button button-dark full-button" disabled={busy}>Continue to payment PIN <ArrowRight size={16} /></button>
        </form>
      </Modal>}
    </div>
  );
}

function PaymentPinModal({
  mode,
  title,
  subtitle,
  amount,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  mode: 'setup' | 'verify';
  title: string;
  subtitle: string;
  amount?: number;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (pin: string) => Promise<boolean>;
}) {
  const [pin, setPin] = useState('');
  const [confirmationPin, setConfirmationPin] = useState('');
  const [formError, setFormError] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    if (mode === 'setup' && pin !== confirmationPin) {
      setFormError('The PIN entries do not match.');
      return;
    }
    if (await onSubmit(pin)) {
      setPin('');
      setConfirmationPin('');
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="modal-icon peach"><LockKeyhole size={20} /></div>
      <h2>{title}</h2>
      <p className="modal-copy">{subtitle}</p>
      {amount !== undefined && <div className="salary-amount-row"><span>Amount</span><strong>{money(amount)}</strong></div>}
      <form className="form-stack" onSubmit={handleSubmit}>
        <label>
          {mode === 'setup' ? 'Choose a 4-digit payment PIN' : 'Payment PIN'}
          <input
            type="password"
            name="payment-pin"
            inputMode="numeric"
            autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
            pattern="[0-9]{4}"
            minLength={4}
            maxLength={4}
            value={pin}
            onChange={(event) => setPin(event.currentTarget.value.replace(/\D/g, '').slice(0, 4))}
            required
          />
        </label>
        {mode === 'setup' && (
          <label>
            Confirm payment PIN
            <input
              type="password"
              name="payment-pin-confirm"
              inputMode="numeric"
              autoComplete="new-password"
              pattern="[0-9]{4}"
              minLength={4}
              maxLength={4}
              value={confirmationPin}
              onChange={(event) => setConfirmationPin(event.currentTarget.value.replace(/\D/g, '').slice(0, 4))}
              required
            />
          </label>
        )}
        {(formError || error) && <div className="form-message" role="alert">{formError || error}</div>}
        <button className="button button-dark full-button" disabled={busy || pin.length !== 4 || (mode === 'setup' && confirmationPin.length !== 4)}>
          {busy ? 'Authorizing…' : mode === 'setup' ? 'Set PIN and confirm payment' : 'Confirm payment'} <ArrowRight size={15} />
        </button>
      </form>
      <div className="secure-note"><LockKeyhole size={13} /> Your PIN is verified by the MFI and is never stored in your browser.</div>
    </Modal>
  );
}

/* ===================================================================
   PAGE COMPONENTS
   =================================================================== */
function DiscoverPage({ creators, posts, onSelect, onSupport, user }: {
  creators: Creator[]; posts: Post[]; onSelect: (creator: Creator) => void; onSupport: (tier: Tier) => void; user: User | null;
}) {
  return <div className="page-wrap">
    <div className="hero-panel">
      <div className="hero-copy">
        <div className="eyebrow"><span className="eyebrow-line" /> A LITTLE MORE HUMAN</div>
        <h1>Good things<br />grow <em>together.</em></h1>
        <p>A place to find your people, back what they make, and get a little closer to the things you love.</p>
        <button className="button button-dark" onClick={() => document.getElementById('creator-list')?.scrollIntoView({ behavior: 'smooth' })}>Find your people <ArrowDownRight size={16} /></button>
        <div className="hero-proof"><div className="proof-avatars"><span>N</span><span>S</span><span>M</span><b>+</b></div><span>Made for people who make things.</span></div>
      </div>
      <div className="hero-art" aria-label="Illustration of the creator community">
        <div className="art-sun" /><div className="art-shape shape-one" /><div className="art-shape shape-two" /><div className="art-shape shape-three" />
        <div className="art-sticker sticker-top"><Sparkles size={17} /> made with love</div>
        <div className="art-sticker sticker-bottom"><Heart size={17} fill="currentColor" /> good people, good work</div>
        <div className="art-figure"><div className="figure-hair" /><div className="figure-face" /><div className="figure-body" /><div className="figure-arm" /></div>
        <div className="art-leaf leaf-a" /><div className="art-leaf leaf-b" /><div className="art-leaf leaf-c" />
      </div>
    </div>
    <div className="section-heading" id="creator-list">
      <div><div className="eyebrow">YOUR NEW FAVORITES</div><h2>People worth showing up for.</h2><p>Meet the makers putting a little more good into the world.</p></div>
      <button className="text-button">See everyone <ArrowRight size={15} /></button>
    </div>
    {creators.length ? <div className="creator-grid">
      {creators.slice(0, 6).map((creator, index) => <CreatorCard key={creator.id} creator={creator} index={index} onClick={() => onSelect(creator)} onSupport={onSupport} />)}
    </div> : <EmptyState title="No creators just yet." detail="Try a different search, or be the first to make a page." />}
    <div className="community-strip"><div className="strip-icon"><MessageCircle size={21} /></div><div><strong>Not just a follow. A real connection.</strong><p>Creator memberships are reviewed by your MFI before any payroll deduction starts.</p></div><span className="strip-mark">s.</span></div>
    {posts.length > 0 && <section className="latest-section"><div className="section-heading"><div><div className="eyebrow">FRESH FROM THE FEED</div><h2>Little things, lately.</h2></div></div><PostGrid posts={posts.slice(0, 3)} creators={creators} /></section>}
    {!user && <div className="footer-cta"><div><div className="eyebrow">YOUR PEOPLE ARE HERE</div><h2>Come on in.</h2><p>It's better when we make it together.</p></div><span className="footer-illustration">☺</span></div>}
  </div>;
}

function CreatorCard({ creator, index, onClick, onSupport }: { creator: Creator; index: number; onClick: () => void; onSupport: (tier: Tier) => void }) {
  const tones = ['card-peach', 'card-lilac', 'card-yellow', 'card-green', 'card-blue'];
  const tier = creator.creator_tiers?.[0];
  return <article className="creator-card">
    <button className={`creator-cover ${tones[index % tones.length]}`} onClick={onClick} aria-label={`View ${creator.display_name}`}>
      <span className="cover-stamp">{['a little joy', 'made slowly', 'from the heart', 'good stuff'][index % 4]}</span>
      <span className="cover-shape cover-shape-a" /><span className="cover-shape cover-shape-b" />
      <span className="creator-avatar">{creator.avatar_url ? <img src={creator.avatar_url} alt="" /> : initials(creator.display_name)}</span>
    </button>
    <div className="creator-card-body">
      <button className="creator-name" onClick={onClick}>{creator.display_name}<BadgeCheck size={14} fill="#b9d9c2" stroke="#28563a" /></button>
      <div className="creator-handle">@{creator.handle}</div>
      <p>{creator.bio || 'Making good things and sharing them with you.'}</p>
      <div className="creator-card-bottom"><span><Heart size={13} /> {creator.creator_tiers?.length ? 'Community is growing' : 'New here'}</span><button onClick={onClick}>Say hi <ArrowRight size={14} /></button></div>
      {tier && <button className="quick-support" onClick={() => onSupport(tier)}>One month · {money(Number(tier.amount))} <Heart size={13} /></button>}
    </div>
  </article>;
}

function CreatorPage({ creator, posts, products, onBack, onSupport, onOrder, onShareProfile, onShareProduct, user }: {
  creator: Creator | null;
  posts: Post[];
  products: Product[];
  onBack: () => void;
  onSupport: (tier: Tier) => void;
  onOrder: (product: Product) => void;
  onShareProfile: (creator: Creator) => void;
  onShareProduct: (product: Product) => void;
  user: User | null;
}) {
  if (!creator) {
    // Guard against null creator (e.g., route mismatch). Render nothing or a fallback.
    return <div className="p-4">Creator not found.</div>;
  }

  return <div className="page-wrap creator-page">
    <button className="back-button" onClick={onBack}>← All creators</button>
    <div className="creator-profile-banner">
      <div className="creator-profile-avatar">{creator.avatar_url ? <img src={creator.avatar_url} alt="" /> : initials(creator.display_name)}</div>
      <div className="creator-profile-copy"><div className="eyebrow">@{creator.handle}</div><h1>{creator.display_name}</h1><p>{creator.bio}</p></div>
      <div className="creator-profile-actions">
        <button className="button button-dark" onClick={() => creator.creator_tiers?.[0] && onSupport(creator.creator_tiers[0])}><Heart size={16} /> Show support</button>
        <button className="button button-outline" onClick={() => onShareProfile(creator)}><Send size={15} /> Share profile</button>
        <span><LockKeyhole size={13} /> One month, PIN-confirmed; renew manually</span>
      </div>
    </div>
    <CreatorProducts products={products} onOrder={onOrder} onShareProduct={onShareProduct} />
    <div className="creator-detail-grid">
      <section><div className="section-heading compact"><div><div className="eyebrow">FROM THE CREATOR</div><h2>A little look behind the scenes.</h2></div></div><PostGrid posts={posts} creators={[creator]} /></section>
      <aside className="tier-panel"><div className="eyebrow">BE PART OF IT</div><h2>Come closer.</h2><p>Choose a tier for one month of supporter-only posts. Renewals are manual and each payment needs your PIN.</p>
        {creator.creator_tiers?.length ? creator.creator_tiers.map((tier) => <div className="tier-card" key={tier.id}><div className="tier-price">{money(Number(tier.amount))}<small>/ month</small></div><strong>{tier.name}</strong><p>{tier.description}</p><button className="button button-dark full-button" onClick={() => onSupport(tier)}>Subscribe for one month <ArrowRight size={15} /></button></div>) : <div className="empty-note">This creator is setting up their first support tier.</div>}
        {!user && <div className="secure-note"><LockKeyhole size={13} /> MFI approval required before deductions.</div>}
      </aside>
    </div>
  </div>;
}

function CreatorProducts({ products, onOrder, onShareProduct }: {
  products: Product[];
  onOrder: (product: Product) => void;
  onShareProduct: (product: Product) => void;
}) {
  return <section className="creator-products-section">
    <div className="section-heading compact">
      <div><div className="eyebrow">FROM THE SHOP</div><h2>Things you can take home.</h2></div>
      <span>{products.length} {products.length === 1 ? 'item' : 'items'}</span>
    </div>
    {products.length ? <div className="creator-products-grid">
      {products.map((product, index) => <article className="product-card creator-product-card" key={product.id}>
        <div className={`product-image product-tone-${index % 4}`}>
          {product.image_url ? <img src={product.image_url} alt={product.name} /> : <><Package size={34} strokeWidth={1.2} /><span>{product.name}</span></>}
        </div>
        <div className="product-details"><div><h3>{product.name}</h3><span>Creator-made</span></div><strong>{money(Number(product.price))}</strong></div>
        <p className="product-description">{product.description}</p>
        <div className="product-card-actions">
          <button className="button button-outline" onClick={() => onOrder(product)}>Buy item <ArrowRight size={14} /></button>
          <button className="button button-share" onClick={() => onShareProduct(product)} aria-label={`Share ${product.name}`}><Send size={14} /> Share</button>
        </div>
      </article>)}
    </div> : <EmptyState title="No shop items yet." detail="This creator’s products will appear here when available." />}
  </section>;
}

function LibraryPage({ mandates, subscriptions, salaryApplications, posts, onDiscover }: {
  mandates: Mandate[];
  subscriptions: CreatorSubscription[];
  salaryApplications: SalaryApplication[];
  posts: Post[];
  onDiscover: () => void;
}) {
  const active = mandates.filter((item) => item.status === 'active');
  const activeSubscriptions = subscriptions.filter((item) => item.status === 'active' && new Date(item.expires_at) > new Date());
  const pending = mandates.filter((item) => item.status === 'pending_mfi');
  const approved = mandates.filter((item) => item.status === 'approved');
  const pendingSalary = salaryApplications.filter((a) => a.status === 'pending_mfi');
  const approvedSalary = salaryApplications.filter((a) => a.status === 'approved');
  const rejectedSalary = salaryApplications.filter((a) => a.status === 'rejected');

  return <div className="page-wrap">
    <div className="page-title-block"><div className="eyebrow">YOUR CORNER</div><h1>Your people.</h1><p>The creators you're backing, and the good things they've shared with you.</p></div>

    {/* Salary applications pending */}
    {pendingSalary.length > 0 && (
      <div className="pending-card salary-pending-card">
        <div className="pending-icon salary-icon"><Briefcase size={17} /></div>
        <div>
          <strong>Salary applications in review</strong>
          <p>{pendingSalary.length} payslip {pendingSalary.length === 1 ? 'application is' : 'applications are'} waiting for MFI review. Your support or order activates once approved.</p>
          <div className="salary-app-list">
            {pendingSalary.map((app) => (
              <div className="salary-app-row" key={app.id}>
                <Briefcase size={12} />
                <span className="salary-app-label">{app.context_label}</span>
                <span className="salary-app-amount">{money(app.amount)}</span>
                <span className="status-pill pending">Pending MFI</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )}
    {approvedSalary.length > 0 && (
      <div className="pending-card approved-card">
        <div className="pending-icon"><Clock3 size={17} /></div>
        <div>
          <strong>Salary applications approved</strong>
          <p>{approvedSalary.length} salary {approvedSalary.length === 1 ? 'application is approved' : 'applications are approved'} by your MFI. Check back for next steps on your support or order.</p>
          <div className="salary-app-list">
            {approvedSalary.map((app) => (
              <div className="salary-app-row approved-row" key={app.id}>
                <Briefcase size={12} />
                <span className="salary-app-label">{app.context_label}</span>
                <span className="salary-app-amount">{money(app.amount)}</span>
                <span className="status-pill approved">Approved</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )}
    {rejectedSalary.length > 0 && (
      <div className="pending-card rejected-card">
        <div className="pending-icon"><X size={17} /></div>
        <div>
          <strong>Salary applications not approved</strong>
          <p>Your MFI reviewed these applications. Contact them if you have questions or want to apply again.</p>
          <div className="salary-app-list">
            {rejectedSalary.map((app) => (
              <div className="salary-app-row rejected-row" key={app.id}>
                <Briefcase size={12} />
                <span className="salary-app-label">{app.context_label}</span>
                <span className="salary-app-amount">{money(app.amount)}</span>
                <span className="status-pill rejected">Not approved</span>
                {app.reviewer_notes && <span className="salary-app-note">{app.reviewer_notes}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    )}

    {pending.length > 0 && <div className="pending-card"><div className="pending-icon"><LockKeyhole size={17} /></div><div><strong>Waiting on your MFI</strong><p>{pending.length} support {pending.length === 1 ? 'request is' : 'requests are'} in review. Your salary deduction starts only after approval.</p></div><span className="status-pill pending">MFI review</span></div>}
    {approved.length > 0 && <div className="pending-card approved-card"><div className="pending-icon"><Clock3 size={17} /></div><div><strong>Payroll setup in progress</strong><p>{approved.length} support {approved.length === 1 ? 'request is approved' : 'requests are approved'}, but not active yet. Your MFI must finish setting up the deduction first.</p></div><span className="status-pill approved">Setup needed</span></div>}

    <div className="section-heading"><div><div className="eyebrow">YOUR MEMBERSHIPS</div><h2>People you show up for.</h2></div></div>
    {active.length || activeSubscriptions.length ? <div className="membership-list">
      {active.map((item) => <article className="membership-card" key={item.id}><div className="membership-avatar">{initials(item.creator_profiles?.display_name)}</div><div className="membership-copy"><strong>{item.creator_profiles?.display_name || 'Creator'}</strong><span>{item.creator_tiers?.name || 'Supporter'} · {money(Number(item.monthly_amount))}/mo</span></div><span className="status-pill active"><Check size={12} /> Active</span></article>)}
      {activeSubscriptions.map((item) => <article className="membership-card" key={item.id}><div className="membership-avatar">{initials(item.creator_profiles?.display_name)}</div><div className="membership-copy"><strong>{item.creator_profiles?.display_name || 'Creator'}</strong><span>{item.creator_tiers?.name || 'Supporter'} · through {new Date(item.expires_at).toLocaleDateString()}</span></div><span className="status-pill active"><Check size={12} /> Active</span></article>)}
    </div> : <EmptyState title="Your people are waiting." detail="Find a creator who makes your day a little better." action="Discover creators" onAction={onDiscover} />}
    {posts.length > 0 && <section className="latest-section"><div className="section-heading"><div><div className="eyebrow">JUST FOR YOU</div><h2>From the people you back.</h2></div></div><PostGrid posts={posts} creators={[]} /></section>}
  </div>;
}

function ShopPage({ products, onOrder, onShareProduct, configured }: { products: Product[]; onOrder: (product: Product) => void; onShareProduct: (product: Product) => void; configured: boolean }) {
  return <div className="page-wrap">
    <div className="page-title-block"><div className="eyebrow">THE GOOD STUFF</div><h1>Little things to keep.</h1><p>One-of-a-kind things made by the creators you love.</p></div>
    {products.length ? <div className="product-grid">{products.map((product, index) => <article className="product-card" key={product.id}>
      <div className={`product-image product-tone-${index % 4}`}>{product.image_url ? <img src={product.image_url} alt={product.name} /> : <><Package size={38} strokeWidth={1.2} /><span>{product.name}</span></>}</div>
      <div className="product-details"><div><h3>{product.name}</h3><span>by {product.creator_profiles?.display_name}</span></div><strong>{money(Number(product.price))}</strong></div>
      <p className="product-description">{product.description}</p>
      <div className="product-card-actions">
        <button className="button button-outline" disabled={!configured} onClick={() => onOrder(product)}>{configured ? 'Get this item' : 'Connect Supabase to buy'} <ArrowRight size={14} /></button>
        <button className="button button-share" onClick={() => onShareProduct(product)} aria-label={`Share ${product.name}`}><Send size={14} /> Share</button>
      </div>
    </article>)}</div> : <EmptyState title="The shop is getting ready." detail="Creator-made things will show up here soon." />}
    <div className="shop-notice"><CircleHelp size={16} /><span>Add your delivery details at checkout. After MFI approval, Fleetbase manages delivery from the creator to you, regardless of distance.</span></div>
  </div>;
}

function OrdersPage({
  orders,
  user,
  busy,
  onLogin,
  onRequestReturn,
}: {
  orders: Order[];
  user: User | null;
  busy: boolean;
  onLogin: () => boolean;
  onRequestReturn: (orderId: string, reason: string) => Promise<boolean>;
}) {
  const [returningOrderId, setReturningOrderId] = useState('');

  const submitReturnRequest = async (event: FormEvent<HTMLFormElement>, orderId: string) => {
    event.preventDefault();
    if (!user) {
      onLogin();
      return;
    }
    const formData = new FormData(event.currentTarget);
    const reason = String(formData.get('reason') || '').trim();
    if (await onRequestReturn(orderId, reason)) setReturningOrderId('');
  };

  return <div className="page-wrap orders-page">
    <div className="page-title-block">
      <div className="eyebrow">YOUR ORDERS</div>
      <h1>Orders &amp; returns.</h1>
      <p>Follow Fleetbase delivery updates and ask MFI to review a return within 24 hours of delivery.</p>
    </div>
    {!user ? (
      <div className="studio-section orders-empty-state">
        <p>Sign in to see your shop orders and request a return.</p>
        <button className="button button-dark" onClick={onLogin}>Log in <ArrowRight size={15} /></button>
      </div>
    ) : orders.length === 0 ? (
      <div className="studio-section orders-empty-state">
        <Package size={28} />
        <h2>No shop orders yet.</h2>
        <p>When you buy something from a creator, its delivery status will appear here.</p>
      </div>
    ) : (
      <div className="order-list">
        {orders.map((order) => {
          const deliveredAt = order.delivered_at ? Date.parse(order.delivered_at) : NaN;
          const returnWindowOpen = Number.isFinite(deliveredAt) && Date.now() <= deliveredAt + 24 * 60 * 60 * 1000;
          const returnRequest = order.return_request;
          const canRequestReturn = order.fulfilment_status === 'delivered' && returnWindowOpen && !returnRequest;
          const orderStatus = order.fulfilment_status || order.status;
          return <article className="studio-section" key={order.id}>
            <div className="section-heading compact">
              <div>
                <div className="eyebrow">ORDERED {new Date(order.created_at).toLocaleDateString()}</div>
                <h2>{order.creator_products?.name || 'Creator shop item'}</h2>
                <p>{order.creator_profiles?.display_name || 'Creator'} · Quantity {order.quantity}</p>
              </div>
              <span className={`status-pill ${orderStatus === 'delivered' ? 'active' : 'pending'}`}>{orderStatus.replace(/_/g, ' ')}</span>
            </div>
            <div className="order-row">
              <Truck size={17} />
              <span>Fleetbase status: <strong>{order.fleetbase_status || orderStatus.replace(/_/g, ' ')}</strong></span>
              {order.delivered_at && <span>Delivered {new Date(order.delivered_at).toLocaleString()}</span>}
              {order.fleetbase_tracking_url && <a href={order.fleetbase_tracking_url} target="_blank" rel="noreferrer">Track with Fleetbase</a>}
            </div>
            {returnRequest ? (
              <div className="shop-notice">
                <span>Return request <strong>{returnRequest.status.replace(/_/g, ' ')}</strong> · submitted {new Date(returnRequest.requested_at).toLocaleDateString()}</span>
                <p>{returnRequest.reason}</p>
                {returnRequest.review_note && <p>MFI note: {returnRequest.review_note}</p>}
              </div>
            ) : canRequestReturn ? (
              returningOrderId === order.id ? (
                <form className="form-stack" onSubmit={(event) => submitReturnRequest(event, order.id)}>
                  <label>
                    Why are you requesting a return?
                    <textarea name="reason" minLength={10} maxLength={1000} rows={3} required />
                  </label>
                  <p className="form-hint">MFI will review your request and follow up. Submitting a request does not automatically refund the payment or arrange collection.</p>
                  <div className="button-row">
                    <button className="button button-dark" type="submit" disabled={busy}>Send return request</button>
                    <button className="button button-outline" type="button" onClick={() => setReturningOrderId('')}>Cancel</button>
                  </div>
                </form>
              ) : (
                <button className="button button-outline" onClick={() => setReturningOrderId(order.id)}>Request a return</button>
              )
            ) : order.fulfilment_status === 'delivered' && !returnRequest ? (
              <p className="form-hint">The 24-hour return request period has ended.</p>
            ) : orderStatus !== 'delivered' ? (
              <p className="form-hint">Return requests are available for 24 hours after Fleetbase confirms delivery.</p>
            ) : null}
          </article>;
        })}
      </div>
    )}
  </div>;
}

function CoordinatesFields({
  latitudeName,
  longitudeName,
  initialLatitude,
  initialLongitude,
}: {
  latitudeName: string;
  longitudeName: string;
  initialLatitude?: number | null;
  initialLongitude?: number | null;
}) {
  const [latitude, setLatitude] = useState(initialLatitude == null ? '' : String(initialLatitude));
  const [longitude, setLongitude] = useState(initialLongitude == null ? '' : String(initialLongitude));
  const [error, setError] = useState('');

  const useCurrentLocation = () => {
    setError('');
    if (!navigator.geolocation) {
      setError('Location is not available in this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLatitude(coords.latitude.toFixed(6));
        setLongitude(coords.longitude.toFixed(6));
      },
      (locationError) => setError(locationError.message || 'Could not get your current location.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return <>
    <div className="form-row-two">
      <label>Latitude<input name={latitudeName} type="number" min="-90" max="90" step="any" value={latitude} onChange={(event) => setLatitude(event.target.value)} required /></label>
      <label>Longitude<input name={longitudeName} type="number" min="-180" max="180" step="any" value={longitude} onChange={(event) => setLongitude(event.target.value)} required /></label>
    </div>
    <button type="button" className="button button-outline" onClick={useCurrentLocation}><MapPin size={14} /> Use this device’s location</button>
    {error && <p className="form-message" role="alert">{error}</p>}
  </>;
}

/* ===================================================================
   PAY PAGE — handles all payments, salary linking, direct pay, pledges,
   and payroll deduction schedules backed by Trustea MFI & InstaPay.
   =================================================================== */
function PayPage({
  user,
  salaryAccount,
  mandates,
  salaryApplications,
  orders,
  directPayments,
  creators,
  configured,
  busy,
  subTab,
  onSubTabChange,
  pendingIntent,
  onClearPendingIntent,
  onCompletePendingIntent,
  onRegisterSalary,
  onDirectPayment,
  onCancelMandate,
  onLogin,
  onPromptPinSetup,
  hasValidAccount,
  subscriptions,
}: {
  user: User | null;
  salaryAccount: SalaryAccount | null;
  mandates: Mandate[];
  subscriptions: CreatorSubscription[];
  salaryApplications: SalaryApplication[];
  orders: Order[];
  directPayments: DirectPayment[];
  creators: Creator[];
  configured: boolean;
  busy: boolean;
  subTab: PaySubTab;
  onSubTabChange: (tab: PaySubTab) => void;
  pendingIntent: PendingIntent;
  onClearPendingIntent: () => void;
  onCompletePendingIntent: () => void;
  onRegisterSalary: (details: {
    firstName: string;
    lastName: string;
    nrcNumber: string;
    employmentNumber: string;
    employer: string;
    monthlySalary: number;
    phone: string;
    payslipFile: File | null;
  }) => Promise<boolean>;
  onDirectPayment: (params: {
    recipientName: string;
    recipientPhone?: string;
    amount: number;
    note: string;
  }) => void;
  onCancelMandate: (mandateId: string) => Promise<void>;
  onLogin: () => boolean;
  onPromptPinSetup: () => void;
  hasValidAccount: boolean;
}) {
  const [panel, setPanel] = useState<PaySubTab | null>(
    pendingIntent ? subTab : null
  );
  const [salaryFormOpen, setSalaryFormOpen] = useState(!salaryAccount || salaryAccount.status === 'unlinked');
  const [payslipFile, setPayslipFile] = useState<File | null>(null);

  const openPanel = (nextPanel: PaySubTab) => {
    setPanel(nextPanel);
    onSubTabChange(nextPanel);
  };

  const handleSalarySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) {
      onLogin();
      return;
    }
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const submitted = await onRegisterSalary({
      firstName: String(form.get('firstName') || '').trim(),
      lastName: String(form.get('lastName') || '').trim(),
      nrcNumber: String(form.get('nrcNumber') || '').trim(),
      employmentNumber: String(form.get('employmentNumber') || '').trim(),
      employer: String(form.get('employer') || '').trim(),
      monthlySalary: Number(form.get('monthlySalary')),
      phone: String(form.get('phone') || '').trim(),
      payslipFile,
    });
    if (!submitted) return;
    setSalaryFormOpen(false);
    setPayslipFile(null);
  };

  const handleDirectPaymentSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) {
      onLogin();
      return;
    }
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const amount = Number(form.get('amount'));
    if (!Number.isFinite(amount) || amount <= 0) return;
    await onDirectPayment({
      recipientName: String(form.get('recipientName') || '').trim(),
      recipientPhone: String(form.get('recipientPhone') || '').trim() || undefined,
      amount,
      note: String(form.get('note') || '').trim(),
    });
  };

  const outstanding = directPayments
    .filter((payment) => payment.status === 'authorized')
    .reduce((sum, payment) => sum + payment.amount, 0)
    + mandates.filter((mandate) => mandate.status === 'active')
      .reduce((sum, mandate) => sum + Number(mandate.monthly_amount), 0);
  const availableLimit = salaryAccount?.approvedLimit != null
    ? Math.max(salaryAccount.approvedLimit - outstanding, 0)
    : null;
  const historyEntries = [
    ...directPayments.map((payment) => ({
      id: payment.id,
      label: payment.title,
      detail: payment.note || payment.recipient,
      amount: payment.amount,
      status: payment.paymentType === 'shop_order' && payment.status === 'authorized'
        ? payment.fulfilmentStatus === 'awaiting_mfi'
          ? 'Authorized · awaiting MFI approval'
          : `Fleetbase · ${(payment.fulfilmentStatus || 'awaiting MFI approval').replace(/_/g, ' ')}`
        : payment.status === 'authorized' ? 'Authorized · awaiting settlement' : payment.status === 'settled' ? 'Settled' : 'Voided',
      method: 'Salary facility',
      createdAt: payment.created_at,
      trackingUrl: payment.trackingUrl || null,
    })),
    ...salaryApplications
      .filter((application) => application.context_type !== 'salary_facility')
      .map((application) => ({
        id: application.id,
        label: application.context_label,
        detail: application.context_type === 'shop_order' ? 'Shop order' : 'Creator support',
        amount: application.amount,
        status: application.status === 'pending_mfi' ? 'Pending MFI' : application.status === 'approved' ? 'Approved' : 'Not approved',
        method: 'Salary',
        createdAt: application.created_at,
        trackingUrl: null,
      })),
    ...orders.filter((order) => !order.payment_authorization_id).map((order) => ({
      id: order.id,
      label: order.creator_products?.name || 'Creator shop order',
      detail: `Quantity ${order.quantity}`,
      amount: 0,
      status: order.status,
      method: 'Shop',
      createdAt: order.created_at,
      trackingUrl: null,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const intentLabel = pendingIntent?.type === 'donate'
    ? `${pendingIntent.tier.name} for ${pendingIntent.creator?.display_name || 'a creator'}`
    : pendingIntent?.type === 'buy'
      ? pendingIntent.product.name
      : '';

  return (
    <div className="page-wrap pay-page">
      <div className="page-title-block">
        <div className="eyebrow">YOUR PAYMENTS</div>
        <h1>A little goes a long way.</h1>
        <p>Manage your salary account, support creators, and keep track of your requests.</p>
      </div>

      {pendingIntent && (
        <div className="pending-intent-banner">
          <div className="pending-intent-content">
            <Heart className="intent-icon" size={19} />
            <div className="intent-copy">
              <h3>Almost there.</h3>
              <p>{hasValidAccount ? `Continue with ${intentLabel}.` : `Link your salary account to continue with ${intentLabel}.`}</p>
            </div>
          </div>
          <div className="pending-intent-actions">
            <button className="button button-dark" onClick={() => hasValidAccount ? onCompletePendingIntent() : openPanel('salary')}>
              {hasValidAccount ? 'Continue' : 'Link account'} <ArrowRight size={14} />
            </button>
            <button className="icon-close-intent" onClick={onClearPendingIntent} aria-label="Dismiss pending payment"><X size={15} /></button>
          </div>
        </div>
      )}

      {!user && (
        <div className="pending-card">
          <div className="pending-icon"><LockKeyhole size={17} /></div>
          <div><strong>Log in to manage payments</strong><p>Your salary account, creator pledges, and payment history are available after you log in.</p></div>
          <button className="button button-dark" onClick={onLogin}>Log in <ArrowRight size={14} /></button>
        </div>
      )}

      {salaryAccount && (
        <section className="pay-summary-card">
          <div className="pay-summary-top">
            <span className="eyebrow">SALARY ACCOUNT</span>
            <span className={`status-pill ${salaryAccount.status === 'linked' ? 'active' : 'pending'}`}>
              {salaryAccount.status === 'linked' ? 'Verified' : 'MFI review'}
            </span>
          </div>
          <div className="pay-summary-name">{salaryAccount.firstName} {salaryAccount.lastName}</div>
          <div className="pay-summary-employer">{salaryAccount.employer || 'Employer not provided'} · {salaryAccount.employmentNumber}</div>
          <div className="pay-summary-figures">
            <div><small>Monthly salary</small><strong>{money(salaryAccount.monthlySalary)}</strong></div>
            <div><small>Approved facility limit</small><strong>{salaryAccount.approvedLimit ? money(salaryAccount.approvedLimit) : 'Pending MFI'}</strong></div>
            <div><small>Available limit</small><strong className="highlight-green">{availableLimit === null ? 'Pending MFI' : money(availableLimit)}</strong></div>
          </div>
        </section>
      )}

      <div className="pay-action-grid">
        <button className="pay-action-tile" onClick={() => openPanel('salary')}>
          <span className="tile-icon green"><Briefcase size={18} /></span><strong>Salary account</strong><span>{salaryAccount ? 'View or update details' : 'Link your account'}</span>
          {!salaryAccount && <span className="tile-badge">Set up</span>}
        </button>
        <button className="pay-action-tile" onClick={() => openPanel('direct')}>
          <span className="tile-icon blue"><CreditCard size={18} /></span><strong>Direct payment</strong><span>Pay someone directly</span>
        </button>
        <button className="pay-action-tile" onClick={() => openPanel('pledges')}>
          <span className="tile-icon peach"><Heart size={18} /></span><strong>My pledges</strong><span>Manage creator support</span>
          {mandates.length > 0 && <span className="tile-count">{mandates.length}</span>}
        </button>
        <button className="pay-action-tile" onClick={() => openPanel('history')}>
          <span className="tile-icon lilac"><Clock3 size={18} /></span><strong>Payment history</strong><span>See recent activity</span>
        </button>
      </div>

      {panel === 'salary' && (
        <section className="pay-section salary-form-card">
          <div className="section-intro">
            <span className="intro-icon"><Briefcase size={18} /></span>
            <div><h2>{salaryAccount ? 'Your salary facility' : 'Apply for a salary facility'}</h2><p>Apply once. MFI staff assess your eligibility and set your maximum outstanding limit separately from each payment.</p></div>
          </div>
          {salaryAccount && !salaryFormOpen ? (
            <div className="salary-card-verified">
              <div className="salary-card-main">
                <div className="salary-user-info"><h2>{salaryAccount.firstName} {salaryAccount.lastName}</h2><div className="salary-meta-row">{salaryAccount.employer} · {salaryAccount.employmentNumber}</div></div>
                <span className="mfi-partner-chip"><BadgeCheck size={14} /> {salaryAccount.status === 'linked' ? 'MFI approved' : salaryAccount.status === 'unlinked' ? 'Not approved' : 'Awaiting MFI'}</span>
              </div>
              <div className="salary-card-details-grid">
                <label>Monthly salary<span>{money(salaryAccount.monthlySalary)}</span></label>
                <label>Phone<span>{salaryAccount.phone || 'Not provided'}</span></label>
                <label>NRC number<span>{salaryAccount.nrcNumber || 'Not provided'}</span></label>
                <label>Approved maximum<span>{salaryAccount.approvedLimit ? money(salaryAccount.approvedLimit) : 'Not set'}</span></label>
              </div>
              {salaryAccount.status === 'linked' && (
                <div className="salary-card-actions">
                  {salaryAccount.hasPin
                    ? <span className="choice-pill active"><BadgeCheck size={13} /> Payment PIN ready</span>
                    : <button className="button button-dark" onClick={onPromptPinSetup}>Set up payment PIN <ArrowRight size={14} /></button>}
                </div>
              )}
            </div>
          ) : (
            <form className="form-stack" onSubmit={handleSalarySubmit}>
              <div className="form-info-strip"><LockKeyhole size={14} /> This is a separate eligibility application. MFI staff determine your approved outstanding limit; no payment is requested by this form.</div>
              <div className="form-row-two">
                <label>First name<input name="firstName" defaultValue={salaryAccount?.firstName || ''} autoComplete="given-name" required /></label>
                <label>Last name<input name="lastName" defaultValue={salaryAccount?.lastName || ''} autoComplete="family-name" required /></label>
              </div>
              <div className="form-row-two">
                <label>NRC number<input name="nrcNumber" defaultValue={salaryAccount?.nrcNumber || ''} required /></label>
                <label>Employment number<input name="employmentNumber" defaultValue={salaryAccount?.employmentNumber || ''} required /></label>
              </div>
              <div className="form-row-two">
                <label>Employer<input name="employer" defaultValue={salaryAccount?.employer || ''} required /></label>
                <label>Monthly salary (ZMW)<input name="monthlySalary" type="number" min="1" step="0.01" defaultValue={salaryAccount?.monthlySalary || ''} required /></label>
              </div>
              <label>Phone number<input name="phone" type="tel" defaultValue={salaryAccount?.phone || ''} autoComplete="tel" required /></label>
              <MediaPicker
                label="Latest payslip (optional)"
                file={payslipFile}
                onChange={setPayslipFile}
                accept="image/jpeg,image/png,image/webp,application/pdf"
              />
              <div className="form-actions-row">
                <button className="button button-dark" disabled={busy || !configured || !user}>{busy ? 'Submitting…' : 'Apply for salary facility'} <ArrowRight size={15} /></button>
                {salaryAccount && <button type="button" className="button button-outline" onClick={() => setSalaryFormOpen(false)}>Cancel</button>}
              </div>
              {!user && <div className="form-message">Log in to apply for a salary facility.</div>}
              {!configured && <div className="form-message">Connect Supabase to submit salary account details.</div>}
            </form>
          )}
        </section>
      )}

      {panel === 'direct' && (
        <section className="pay-section direct-pay-card">
          <div className="section-intro">
            <span className="intro-icon"><CreditCard size={18} /></span>
            <div><h2>Make a donation</h2><p>Authorize a one-time payment from your MFI-approved salary facility with your payment PIN.</p></div>
          </div>
          <form className="form-stack" onSubmit={handleDirectPaymentSubmit}>
            <label>Recipient name<input name="recipientName" maxLength={100} required /></label>
            <label>Recipient phone <span className="optional">(optional)</span><input name="recipientPhone" type="tel" /></label>
            <label>Amount (ZMW)<input name="amount" type="number" min="1" step="0.01" required /></label>
            <label>Payment note <span className="optional">(optional)</span><textarea name="note" maxLength={240} rows={2} /></label>
            {!hasValidAccount && <div className="form-message">An approved salary facility is required before making this payment.</div>}
            <button className="button button-dark" disabled={busy || !configured || !hasValidAccount}>{busy ? 'Preparing…' : 'Continue to PIN confirmation'} <ArrowRight size={15} /></button>
            {!configured && <div className="form-message">Connect Supabase to authorize payments.</div>}
          </form>
        </section>
      )}

      {panel === 'pledges' && (
        <section className="pay-section">
          <div className="section-intro"><span className="intro-icon"><Heart size={18} /></span><div><h2>Creator pledges</h2><p>See the people you support and manage recurring commitments.</p></div></div>
          {mandates.length || subscriptions.length ? (
            <div className="pledge-list">
              {mandates.map((mandate) => (
                <article className="pledge-card" key={mandate.id}>
                  <div className="pledge-main">
                    <div className="pledge-avatar">{initials(mandate.creator_profiles?.display_name)}</div>
                    <div className="pledge-info"><strong>{mandate.creator_profiles?.display_name || 'Creator'}</strong><span>{mandate.creator_tiers?.name || 'Creator support'} · {mandate.status.replace('_', ' ')}</span></div>
                  </div>
                  <div className="pledge-schedule"><span>Monthly support</span><strong>{money(Number(mandate.monthly_amount))}</strong></div>
                  <span className="status-pill">{mandate.status.replace('_', ' ')}</span>
                  {mandate.status === 'active' && <button className="pledge-cancel-btn" disabled={busy} onClick={() => onCancelMandate(mandate.id)}>Cancel</button>}
                </article>
              ))}
              {subscriptions.filter((subscription) => subscription.status === 'active' && new Date(subscription.expires_at) > new Date()).map((subscription) => (
                <article className="pledge-card" key={subscription.id}>
                  <div className="pledge-main">
                    <div className="pledge-avatar">{initials(subscription.creator_profiles?.display_name)}</div>
                    <div className="pledge-info"><strong>{subscription.creator_profiles?.display_name || 'Creator'}</strong><span>{subscription.creator_tiers?.name || 'Creator subscription'} · paid through {new Date(subscription.expires_at).toLocaleDateString()}</span></div>
                  </div>
                  <div className="pledge-schedule"><span>Subscription</span><strong>One month</strong></div>
                  <span className="status-pill active">Active</span>
                </article>
              ))}
            </div>
          ) : <EmptyState title="No pledges yet." detail="Find a creator to support and your memberships will appear here." />}
        </section>
      )}

      {panel === 'history' && (
        <section className="pay-section">
          <div className="section-intro"><span className="intro-icon"><Clock3 size={18} /></span><div><h2>Payment history</h2><p>Recent payments, salary requests, and shop orders.</p></div></div>
          {historyEntries.length ? (
            <div className="history-ledger">
              {historyEntries.map((entry) => (
                <article className="history-row-item" key={`${entry.method}-${entry.id}`}>
                  <div className="history-icon-col">{entry.method === 'Salary' ? <Briefcase size={17} /> : entry.method === 'Shop' ? <ShoppingBag size={17} /> : <CreditCard size={17} />}</div>
                  <div className="history-info-col"><strong>{entry.label}</strong><span>{entry.detail} · {new Date(entry.createdAt).toLocaleDateString()}</span></div>
                  <div className="history-amount-col">{entry.amount > 0 && <strong>{money(Number(entry.amount))}</strong>}<span>{entry.status}</span>{entry.trackingUrl && <a href={entry.trackingUrl} target="_blank" rel="noreferrer">Track order</a>}</div>
                  <div className="history-method-col"><span className="method-pill">{entry.method}</span></div>
                </article>
              ))}
            </div>
          ) : <EmptyState title="Nothing to show just yet." detail="Your payment and order activity will appear here." />}
        </section>
      )}
    </div>
  );
}

function StudioPage({ user, creator, creatorFulfilment, posts, products, orders, busy, onLogin, onCreateProfile, onCreatePost, onCreateProduct, onCreateTier, onEditPickup, onOrderStatusChange, onShareProfile }: {
  user: User | null; creator: Creator | null; creatorFulfilment: CreatorFulfilmentProfile | null; posts: Post[]; products: Product[]; orders: Order[]; onLogin: () => boolean;
  busy: boolean;
  onCreateProfile: () => void; onCreatePost: () => void; onCreateProduct: () => void; onCreateTier: () => void; onEditPickup: () => void;
  onOrderStatusChange: (orderId: string, status: 'accepted' | 'declined') => void;
  onShareProfile: (creator: Creator) => void;
}) {
  if (!user) return <div className="page-wrap"><div className="page-title-block"><div className="eyebrow">YOUR WORK, YOUR WAY</div><h1>Make a little something.</h1><p>Build your page, share the process, and find people who care.</p></div><div className="studio-welcome"><div className="studio-welcome-icon"><Sparkles size={28} /></div><h2>Your audience is out there.</h2><p>Log in or make an account to open your creator studio.</p><button className="button button-dark" onClick={onLogin}>Log in to get started <ArrowRight size={15} /></button></div></div>;
  if (!creator) return <div className="page-wrap"><div className="page-title-block"><div className="eyebrow">YOUR WORK, YOUR WAY</div><h1>Make a little something.</h1><p>Build your page, share the process, and find people who care.</p></div><div className="studio-welcome"><div className="studio-welcome-icon"><Sparkles size={28} /></div><h2>Start your creator page.</h2><p>Set up your page in a minute. You can add supporter tiers and posts whenever you're ready.</p><button className="button button-dark" onClick={onCreateProfile}>Create my page <ArrowRight size={15} /></button></div></div>;
  const profilePosts = posts.filter((post) => post.creator_id === creator.id);
  const profileProducts = products.filter((product) => product.creator_id === creator.id);
  return <div className="page-wrap">
    <div className="studio-header"><div><div className="eyebrow">CREATOR STUDIO</div><h1>Your little corner.</h1><p>Say something. Make something. Let your people in.</p></div><span className="creator-live"><i /> Your page is live</span></div>
    <div className="studio-metrics"><div><span>Posts</span><strong>{profilePosts.length}</strong><small>little things shared</small></div><div><span>Shop items</span><strong>{profileProducts.length}</strong><small>made by you</small></div><div><span>Order requests</span><strong>{orders.length}</strong><small>check in with your people</small></div></div>
    <div className="studio-actions"><button className="button button-dark" onClick={onCreatePost}><Plus size={16} /> Write a post</button><button className="button button-outline" onClick={onCreateProduct}><ShoppingBag size={16} /> Add something to shop</button><button className="button button-outline" onClick={() => onShareProfile(creator)}><Send size={15} /> Share profile</button><button className="button button-outline" onClick={onCreateTier}><Heart size={16} /> Add a support tier</button></div>
    <section className="studio-section">
      <div className="section-heading compact"><div><div className="eyebrow">SHOP DELIVERY</div><h2>Pickup details</h2></div><button className="button button-outline" onClick={onEditPickup}>{creatorFulfilment ? 'Update pickup details' : 'Set pickup details'}</button></div>
      <p>{creatorFulfilment ? `${creatorFulfilment.pickup_address} · ${creatorFulfilment.pickup_phone}` : 'Add your pickup contact and location before customers can order physical shop items.'}</p>
    </section>
    {orders.length > 0 && <section className="studio-section"><div className="section-heading compact"><div><div className="eyebrow">FROM YOUR SHOP</div><h2>Orders and deliveries</h2></div></div><div className="order-list">{orders.map((order) => <div className="order-row" key={order.id}><Package size={17} /><strong>{order.creator_products?.name || 'Your item'}</strong><span>Qty {order.quantity}</span><span className={`status-pill ${order.status === 'accepted' || order.status === 'fulfilled' ? 'active' : 'pending'}`}>{order.fulfilment_status ? order.fulfilment_status.replace(/_/g, ' ') : order.status}</span>{order.fleetbase_tracking_url && <a href={order.fleetbase_tracking_url} target="_blank" rel="noreferrer">Track delivery</a>}{order.status === 'requested' && !order.payment_authorization_id && <div className="order-actions"><button disabled={busy} onClick={() => onOrderStatusChange(order.id, 'accepted')}>Accept</button><button disabled={busy} onClick={() => onOrderStatusChange(order.id, 'declined')}>Decline</button></div>}</div>)}</div></section>}
    <section className="studio-section"><div className="section-heading compact"><div><div className="eyebrow">YOUR LATEST</div><h2>Posts you've shared.</h2></div></div>{profilePosts.length ? <PostGrid posts={profilePosts} creators={[creator]} /> : <EmptyState title="Your feed is a blank page." detail="Write the first post to say hello to your supporters." action="Write a post" onAction={onCreatePost} />}</section>
  </div>;
}

function PostGrid({ posts, creators }: { posts: Post[]; creators: Creator[] }) {
  const protectedKeys = posts
    .map((post) => post.image_url)
    .filter((imageUrl): imageUrl is string => Boolean(imageUrl?.startsWith('r2://private/posts/')))
    .map((imageUrl) => imageUrl.slice('r2://'.length));
  const protectedKeyList = protectedKeys.join('\n');
  const [protectedUrls, setProtectedUrls] = useState<Record<string, string>>({});
  const [mediaError, setMediaError] = useState('');

  useEffect(() => {
    let active = true;
    setProtectedUrls({});
    setMediaError('');
    if (!protectedKeyList) return () => { active = false; };
    resolvePrivateMedia(protectedKeyList.split('\n'))
      .then((urls) => { if (active) setProtectedUrls(urls); })
      .catch((loadError: Error) => { if (active) setMediaError(loadError.message); });
    return () => { active = false; };
  }, [protectedKeyList]);

  if (!posts.length) return <EmptyState title="Nothing here just yet." detail="Come back soon for something good." />;
  return <>{mediaError && <div className="form-message" role="alert">{mediaError}</div>}<div className="post-grid">{posts.map((post, index) => {
    const creator = creators.find((item) => item.id === post.creator_id);
    const authorName = post.creator_profiles?.display_name || creator?.display_name || 'Creator';
    const locked = post.visibility === 'supporters';
    const imageUrl = post.image_url?.startsWith('r2://private/posts/')
      ? protectedUrls[post.image_url.slice('r2://'.length)]
      : post.image_url;
    return <article className="post-card" key={post.id}>
      <div className={`post-art post-art-${index % 4}`}>{imageUrl ? <img src={imageUrl} alt="" /> : <><span className="post-art-sun" /><span className="post-art-text">{['a thought for today', 'work in progress', 'made with care', 'from the studio'][index % 4]}</span><span className="post-art-mark">✳</span></>}</div>
      <div className="post-card-body"><div className="post-meta"><span>{authorName}</span><span>·</span><span>{new Date(post.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>{locked && <span className="locked-label"><LockKeyhole size={11} /> supporters</span>}</div><h3>{post.title}</h3><p>{post.body}</p></div>
    </article>;
  })}</div></>;
}

function EmptyState({ title, detail, action, onAction }: { title: string; detail: string; action?: string; onAction?: () => void }) {
  return <div className="empty-state"><div className="empty-doodle"><Sparkles size={21} /></div><strong>{title}</strong><p>{detail}</p>{action && onAction && <button onClick={onAction}>{action} <ArrowRight size={14} /></button>}</div>;
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal-card" role="dialog" aria-modal="true"><button className="modal-close" onClick={onClose} aria-label="Close"><X size={19} /></button>{children}</section></div>;
}