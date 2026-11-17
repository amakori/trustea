import { useEffect, useState } from 'react';
import { ArrowRight, Heart, LockKeyhole, BadgeCheck, Send } from 'lucide-react';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import { shareLink } from './lib/share';
import type { Creator, Tier, Product } from './App';

// ---- Inline preview data (mirrors App.tsx, no circular dep) ----
const previewCreators: Creator[] = [
  { id: 'preview-1', user_id: '', display_name: 'Nala Makes', handle: 'nalamakes', bio: 'A little color for your everyday. Art, prints & the stories behind them.', avatar_url: null, is_published: true, creator_tiers: [{ id: 'preview-tier-1', creator_id: 'preview-1', name: 'Studio friend', amount: 35, description: 'Studio notes, early looks, and a little thank-you.' }] },
  { id: 'preview-2', user_id: '', display_name: 'The Sunday Table', handle: 'sundaytable', bio: 'Recipes from home, made slowly and shared generously.', avatar_url: null, is_published: true, creator_tiers: [{ id: 'preview-tier-2', creator_id: 'preview-2', name: 'At the table', amount: 50, description: 'Monthly recipes and the stories behind them.' }] },
  { id: 'preview-3', user_id: '', display_name: 'Mwamba Sounds', handle: 'mwambasounds', bio: 'Independent music and notes from the studio in Lusaka.', avatar_url: null, is_published: true, creator_tiers: [{ id: 'preview-tier-3', creator_id: 'preview-3', name: 'Backstage pass', amount: 75, description: 'Demo drops, studio diaries, and early listens.' }] },
];
const previewProducts: Product[] = [
  { id: 'preview-product-1', creator_id: 'preview-1', name: 'Little sunshine print', description: 'A warm, signed A4 art print for your favorite wall.', price: 180, image_url: null },
  { id: 'preview-product-2', creator_id: 'preview-2', name: 'Sunday recipe cards', description: 'A set of handwritten favorites, ready to share around.', price: 120, image_url: null },
  { id: 'preview-product-3', creator_id: 'preview-3', name: 'Studio sessions vol. 1', description: 'A small-batch cassette of live room recordings.', price: 250, image_url: null },
];

const initials = (name = 'S') =>
  name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

const money = (value: number) => `ZMW ${Number(value).toFixed(0)}`;

export default function CreatorSharePage({ slug, productId, onOrder }: { slug: string; productId?: string | null; onOrder: (product: Product) => void }) {
  const [creator, setCreator] = useState<Creator | null>(null);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [shareError, setShareError] = useState('');
  const [shareNotice, setShareNotice] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setCreator(null);
    setTiers([]);
    setProducts([]);
    if (!isSupabaseConfigured || !supabase) {
      // Preview mode — find matching creator by handle
      const found = previewCreators.find((c) => c.handle === slug) ?? null;
      if (active) {
        setCreator(found);
        setTiers(found?.creator_tiers ?? []);
        setProducts(found ? previewProducts.filter((p) => p.creator_id === found.id) : []);
        setLoading(false);
      }
      return () => { active = false; };
    }
    const client = supabase;

    const loadData = async () => {
      try {
        const { data: creatorData, error: cErr } = await client
          .from('creator_profiles')
          .select('*')
          .eq('handle', slug)
          .eq('is_published', true)
          .maybeSingle();
        if (cErr) throw cErr;
        if (!creatorData) return;

        const [tierRes, productRes] = await Promise.all([
          client.from('creator_tiers').select('*').eq('creator_id', creatorData.id).eq('active', true),
          client.from('creator_products').select('*').eq('creator_id', creatorData.id).eq('active', true).order('created_at', { ascending: false }),
        ]);
        if (tierRes.error) throw tierRes.error;
        if (productRes.error) throw productRes.error;
        if (!active) return;
        setCreator(creatorData as Creator);
        setTiers((tierRes.data ?? []) as Tier[]);
        setProducts((productRes.data ?? []) as Product[]);
      } catch (e) {
        if (active) setShareError(e instanceof Error ? e.message : 'Could not load this creator page.');
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadData();
    return () => { active = false; };
  }, [slug]);

  const share = async (title: string, text: string, url: string) => {
    setShareError('');
    setShareNotice('');
    try {
      const result = await shareLink(title, text, url);
      if (result === 'shared') setShareNotice('Share link opened.');
      if (result === 'copied') setShareNotice('Share link copied.');
    } catch (error) {
      setShareError(error instanceof Error ? error.message : 'Could not share this link.');
    }
  };

  if (loading) {
    return (
      <div className="loading-state">
        <div className="spinner" />
        <p>Loading creator page…</p>
      </div>
    );
  }

  if (!creator) {
    return (
      <div className="page-wrap" style={{ textAlign: 'center', paddingTop: '4rem' }}>
        <h2>{shareError ? 'Could not load this creator page.' : 'Creator not found.'}</h2>
        <p style={{ color: 'var(--muted)' }}>{shareError || 'The link may be wrong or the creator has not published yet.'}</p>
        <a href="/" className="button button-dark" style={{ display: 'inline-flex', marginTop: '1.5rem', gap: '6px' }}>
          Go to Trustea <ArrowRight size={15} />
        </a>
      </div>
    );
  }

  const shareUrl = `${window.location.origin}${window.location.pathname}#c/${encodeURIComponent(slug)}`;
  const selectedProduct = productId ? products.find((product) => product.id === productId) : null;

  return (
    <div className="page-wrap creator-page">
      {/* Header */}
      <div className="creator-profile-banner">
        <div className="creator-profile-avatar">
          {creator.avatar_url ? <img src={creator.avatar_url} alt="" /> : initials(creator.display_name)}
        </div>
        <div className="creator-profile-copy">
          <div className="eyebrow">@{creator.handle}</div>
          <h1>{creator.display_name} <BadgeCheck size={18} fill="#b9d9c2" stroke="#28563a" /></h1>
          <p>{creator.bio}</p>
        </div>
        <div className="creator-profile-actions">
          <button className="button button-dark" onClick={() => void share(`${creator.display_name} on Trustea`, `Discover ${creator.display_name} on Trustea.`, shareUrl)}>
            <Send size={14} /> Share this page
          </button>
          <span><LockKeyhole size={13} /> MFI-reviewed monthly support</span>
        </div>
      </div>
      {(shareError || shareNotice) && <div className={shareError ? 'error-banner' : 'shop-notice'} role={shareError ? 'alert' : 'status'}>{shareError || shareNotice}</div>}

      <div className="creator-detail-grid">
        {/* Tiers / Support section */}
        <aside className="tier-panel">
          <div className="eyebrow">BE PART OF IT</div>
          <h2>Support {creator.display_name}.</h2>
          <p>Choose a monthly tier. All payments are MFI-reviewed before any deduction starts.</p>
          {tiers.length ? tiers.map((tier) => (
            <div className="tier-card" key={tier.id}>
              <div className="tier-price">{money(Number(tier.amount))}<small>/ month</small></div>
              <strong>{tier.name}</strong>
              <p>{tier.description}</p>
              <a href="/#pay" className="button button-dark full-button" style={{ display: 'flex', justifyContent: 'center', gap: '6px', textDecoration: 'none' }}>
                Back this tier <Heart size={14} />
              </a>
            </div>
          )) : (
            <div className="empty-note">This creator is setting up their first support tier.</div>
          )}
        </aside>

        {/* Shop section */}
        {products.length > 0 && (
          <section>
            <div className="section-heading compact">
              <div>
                <div className="eyebrow">FROM THE SHOP</div>
                <h2>{selectedProduct ? selectedProduct.name : 'Things you can take home.'}</h2>
              </div>
            </div>
            {productId && !selectedProduct && <div className="form-message" role="status">That product is no longer available. Browse the creator’s current shop below.</div>}
            <div className="creator-products-grid">
              {(selectedProduct ? [selectedProduct, ...products.filter((product) => product.id !== selectedProduct.id)] : products).map((product) => {
                const productUrl = `${window.location.origin}${window.location.pathname}#c/${encodeURIComponent(slug)}/p/${encodeURIComponent(product.id)}`;
                return <article key={product.id} id={productId === product.id ? 'shared-product' : undefined} className={`product-card creator-product-card ${productId === product.id ? 'shared-product-card' : ''}`}>
                  <div className="product-image product-tone-0">{product.image_url ? <img src={product.image_url} alt={product.name} /> : <><Heart size={32} strokeWidth={1.2} /><span>{product.name}</span></>}</div>
                  <div className="product-details"><div><h3>{product.name}</h3><span>{creator.display_name}</span></div><strong>{money(Number(product.price))}</strong></div>
                  <p className="product-description">{product.description}</p>
                  <div className="product-card-actions">
                    <button className="button button-dark" onClick={() => onOrder(product)}>Buy <ArrowRight size={13} /></button>
                    <button className="button button-share" onClick={() => void share(product.name, `${product.name} by ${creator.display_name} on Trustea.`, productUrl)} aria-label={`Share ${product.name}`}><Send size={13} /> Share</button>
                  </div>
                </article>;
              })}
            </div>
          </section>
        )}
      </div>

      {/* Shareable link strip */}
      <div className="community-strip" style={{ marginTop: '2rem' }}>
        <div className="strip-icon"><Heart size={21} /></div>
        <div>
          <strong>Share this page.</strong>
          <p style={{ wordBreak: 'break-all', fontSize: '13px', color: 'var(--color-muted)', marginTop: '4px' }}>{shareUrl}</p>
        </div>
        <button className="button button-dark" onClick={() => void share(`${creator.display_name} on Trustea`, `Discover ${creator.display_name} on Trustea.`, shareUrl)} style={{ flexShrink: 0 }}>
          <Send size={14} /> Share profile
        </button>
      </div>
    </div>
  );
}
