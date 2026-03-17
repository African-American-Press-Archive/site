import { layout } from './layout';

export function aboutPage(): string {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: 'Dangerous Press Archive',
    description: 'A digitized collection of African American newspapers published between 1905 and 1929.',
    temporalCoverage: '1905/1929',
    license: 'https://creativecommons.org/publicdomain/zero/1.0/',
  };

  const content = `
    <header class="site-header glass">
      <div class="site-header-inner">
        <div class="branding-lockup">
          <span class="brand-emblem" aria-hidden="true">
            <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="6" y="12" width="52" height="40" rx="4" fill="#F5F1E8" stroke="#8B7355" stroke-width="2"/>
              <path d="M12 20H52" stroke="#8B7355" stroke-width="3" stroke-linecap="round"/>
              <path d="M12 28H44" stroke="#8B7355" stroke-width="3" stroke-linecap="round"/>
              <path d="M12 36H40" stroke="#8B7355" stroke-width="3" stroke-linecap="round"/>
              <path d="M12 44H36" stroke="#8B7355" stroke-width="3" stroke-linecap="round"/>
              <path d="M50 24V48" stroke="#8B7355" stroke-width="3" stroke-linecap="round"/>
              <path d="M45 24V48" stroke="#8B7355" stroke-width="3" stroke-linecap="round"/>
              <path d="M16 48H32" stroke="#8B7355" stroke-width="3" stroke-linecap="round"/>
            </svg>
          </span>
          <div>
            <h1 class="hero-title editorial-title"><a href="/" style="text-decoration:none;color:inherit;">Dangerous Press</a></h1>
            <p class="subtitle-text">An Archive of African American Newspapers, 1905\u20131929</p>
          </div>
        </div>
        <nav style="display:flex;align-items:center;gap:1.5rem;">
          <a href="/" class="deco-link">Browse Archive</a>
          <span style="color:var(--unc-tile-teal);font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.35em;">About</span>
        </nav>
      </div>
    </header>

    <div style="max-width:64rem;margin:0 auto;padding:2rem 1.5rem;">
      <section class="glass-card" style="border-radius:1rem;padding:2rem 3rem;margin-bottom:2rem;">
        <h2 style="font-size:1.75rem;font-weight:700;margin-bottom:1.5rem;color:var(--unc-longleaf-pine);">About</h2>

        <p style="font-size:1.05rem;line-height:1.7;color:var(--text-secondary);margin-bottom:1rem;">
          The Dangerous Press archive brings together digitized issues of African American newspapers from the early twentieth century,
          spanning the years 1905 to 1929. This period witnessed the Great Migration, World War I, the Red Summer of 1919,
          the Harlem Renaissance, and the rise of the \u201cNew Negro\u201d movement\u2014all documented in real time by the Black press.
        </p>

        <p style="font-size:1.05rem;line-height:1.7;color:var(--text-secondary);margin-bottom:1rem;">
          These newspapers served as vital organs of information, advocacy, and community building for African Americans during
          an era of segregation, disenfranchisement, and systemic violence. They reported on local and national news often ignored
          or misrepresented by white-owned media, championed civil rights causes, celebrated cultural achievements, and provided
          a platform for Black voices and perspectives.
        </p>

        <p style="font-size:1.05rem;line-height:1.7;color:var(--text-secondary);margin-bottom:1rem;">
          The name Dangerous Press honors this legacy and the risks these publications faced. During World War I, federal agents labeled the Chicago Defender \u201cthe most dangerous of all Negro journals\u201d because of its unflinching coverage of lynching, segregation, and northern migration. Its editor, Robert S. Abbott, and other Black journalists were monitored, threatened, and censored for their outspoken defense of racial justice. What made these newspapers \u201cdangerous\u201d was not disloyalty, but their insistence on truth in an age of repression\u2014their power to awaken, mobilize, and connect Black readers across the nation.
        </p>

        <p style="font-size:1.05rem;line-height:1.7;color:var(--text-secondary);margin-bottom:1.5rem;">
          This collection draws primarily from the Library of Congress\u2019s <a href="https://chroniclingamerica.loc.gov/"
          class="deco-link" target="_blank" rel="noopener">Chronicling America</a>
          digital newspaper archive, supplemented with materials from other sources. The archive is a work in progress,
          with new issues and newspapers being added regularly.
        </p>
      </section>

      <section class="glass-card" style="border-radius:1rem;padding:2rem 3rem;margin-bottom:2rem;">
        <h2 style="font-size:1.5rem;font-weight:700;margin-bottom:0.5rem;color:var(--unc-longleaf-pine);">Collection Overview</h2>
        <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:1.5rem;">
          The archive currently includes issues from 41 newspapers published between 1905 and 1929.
        </p>

        <div style="overflow-x:auto;">
          <table style="width:100%;font-size:0.9rem;border-collapse:collapse;">
            <thead>
              <tr style="border-bottom:2px solid var(--border-color);">
                <th style="text-align:left;padding:0.75rem 0.5rem;font-weight:700;color:var(--unc-longleaf-pine);">Newspaper</th>
                <th style="text-align:left;padding:0.75rem 0.5rem;font-weight:700;color:var(--unc-longleaf-pine);">Years</th>
                <th style="text-align:right;padding:0.75rem 0.5rem;font-weight:700;color:var(--unc-longleaf-pine);">Issues</th>
                <th style="text-align:right;padding:0.75rem 0.5rem;font-weight:700;color:var(--unc-longleaf-pine);">Pages</th>
              </tr>
            </thead>
            <tbody>
              <tr style="border-bottom:1px solid var(--border-color);"><td style="padding:0.75rem 0.5rem;"><a href="/papers/amsterdam-news" class="deco-link">Amsterdam News</a></td><td style="padding:0.75rem 0.5rem;color:var(--text-secondary);">1922-1929</td><td style="text-align:right;padding:0.75rem 0.5rem;">301</td><td style="text-align:right;padding:0.75rem 0.5rem;">5,048</td></tr>
              <tr style="border-bottom:1px solid var(--border-color);"><td style="padding:0.75rem 0.5rem;"><a href="/papers/athens-republique" class="deco-link">Athens Republique</a></td><td style="padding:0.75rem 0.5rem;color:var(--text-secondary);">1921-1926</td><td style="text-align:right;padding:0.75rem 0.5rem;">19</td><td style="text-align:right;padding:0.75rem 0.5rem;">130</td></tr>
              <tr style="border-bottom:1px solid var(--border-color);"><td style="padding:0.75rem 0.5rem;"><a href="/papers/baltimore-afro-american" class="deco-link">Baltimore Afro-American</a></td><td style="padding:0.75rem 0.5rem;color:var(--text-secondary);">1910-1929</td><td style="text-align:right;padding:0.75rem 0.5rem;">999</td><td style="text-align:right;padding:0.75rem 0.5rem;">12,312</td></tr>
              <tr style="border-bottom:1px solid var(--border-color);"><td style="padding:0.75rem 0.5rem;"><a href="/papers/chicago-broad-ax" class="deco-link">Broad Ax</a></td><td style="padding:0.75rem 0.5rem;color:var(--text-secondary);">1905-1927</td><td style="text-align:right;padding:0.75rem 0.5rem;">1,182</td><td style="text-align:right;padding:0.75rem 0.5rem;">5,883</td></tr>
              <tr style="border-bottom:1px solid var(--border-color);"><td style="padding:0.75rem 0.5rem;"><a href="/papers/california-eagle" class="deco-link">California Eagle</a></td><td style="padding:0.75rem 0.5rem;color:var(--text-secondary);">1914-1929</td><td style="text-align:right;padding:0.75rem 0.5rem;">671</td><td style="text-align:right;padding:0.75rem 0.5rem;">6,571</td></tr>
              <tr style="border-bottom:1px solid var(--border-color);"><td style="padding:0.75rem 0.5rem;"><a href="/papers/chicago-defender" class="deco-link">Chicago Defender</a></td><td style="padding:0.75rem 0.5rem;color:var(--text-secondary);">1909-1929</td><td style="text-align:right;padding:0.75rem 0.5rem;">980</td><td style="text-align:right;padding:0.75rem 0.5rem;">11,896</td></tr>
              <tr style="border-bottom:1px solid var(--border-color);"><td style="padding:0.75rem 0.5rem;"><a href="/papers/chicago-whip" class="deco-link">Chicago Whip</a></td><td style="padding:0.75rem 0.5rem;color:var(--text-secondary);">1919-1928</td><td style="text-align:right;padding:0.75rem 0.5rem;">176</td><td style="text-align:right;padding:0.75rem 0.5rem;">1,438</td></tr>
              <tr style="border-bottom:1px solid var(--border-color);"><td style="padding:0.75rem 0.5rem;"><a href="/papers/cleveland-gazette" class="deco-link">Cleveland Gazette</a></td><td style="padding:0.75rem 0.5rem;color:var(--text-secondary);">1905-1929</td><td style="text-align:right;padding:0.75rem 0.5rem;">1,308</td><td style="text-align:right;padding:0.75rem 0.5rem;">5,240</td></tr>
              <tr style="border-bottom:1px solid var(--border-color);"><td style="padding:0.75rem 0.5rem;"><a href="/papers/colorado-statesman" class="deco-link">Colorado Statesman</a></td><td style="padding:0.75rem 0.5rem;color:var(--text-secondary);">1905-1924</td><td style="text-align:right;padding:0.75rem 0.5rem;">998</td><td style="text-align:right;padding:0.75rem 0.5rem;">7,964</td></tr>
              <tr style="border-bottom:1px solid var(--border-color);"><td style="padding:0.75rem 0.5rem;"><a href="/papers/dallas-express" class="deco-link">Dallas Express</a></td><td style="padding:0.75rem 0.5rem;color:var(--text-secondary);">1919-1928</td><td style="text-align:right;padding:0.75rem 0.5rem;">466</td><td style="text-align:right;padding:0.75rem 0.5rem;">4,089</td></tr>
              <tr style="border-bottom:1px solid var(--border-color);"><td style="padding:0.75rem 0.5rem;"><a href="/papers/denver-star" class="deco-link">Denver Star</a></td><td style="padding:0.75rem 0.5rem;color:var(--text-secondary);">1913-1918</td><td style="text-align:right;padding:0.75rem 0.5rem;">291</td><td style="text-align:right;padding:0.75rem 0.5rem;">2,331</td></tr>
              <tr style="border-bottom:1px solid var(--border-color);"><td style="padding:0.75rem 0.5rem;"><a href="/papers/gary-american" class="deco-link">Gary American</a></td><td style="padding:0.75rem 0.5rem;color:var(--text-secondary);">1928-1929</td><td style="text-align:right;padding:0.75rem 0.5rem;">82</td><td style="text-align:right;padding:0.75rem 0.5rem;">434</td></tr>
              <tr style="border-bottom:1px solid var(--border-color);"><td style="padding:0.75rem 0.5rem;"><a href="/papers/houston-informer" class="deco-link">Houston Informer</a></td><td style="padding:0.75rem 0.5rem;color:var(--text-secondary);">1919-1929</td><td style="text-align:right;padding:0.75rem 0.5rem;">327</td><td style="text-align:right;padding:0.75rem 0.5rem;">2,934</td></tr>
              <tr style="border-bottom:1px solid var(--border-color);"><td style="padding:0.75rem 0.5rem;"><a href="/papers/indianapolis-freeman" class="deco-link">Indianapolis Freeman</a></td><td style="padding:0.75rem 0.5rem;color:var(--text-secondary);">1905-1916</td><td style="text-align:right;padding:0.75rem 0.5rem;">623</td><td style="text-align:right;padding:0.75rem 0.5rem;">5,110</td></tr>
              <tr style="border-bottom:1px solid var(--border-color);"><td style="padding:0.75rem 0.5rem;"><a href="/papers/iowa-bystander" class="deco-link">Iowa Bystander</a></td><td style="padding:0.75rem 0.5rem;color:var(--text-secondary);">1905-1921</td><td style="text-align:right;padding:0.75rem 0.5rem;">871</td><td style="text-align:right;padding:0.75rem 0.5rem;">3,994</td></tr>
              <tr style="border-bottom:1px solid var(--border-color);"><td style="padding:0.75rem 0.5rem;"><a href="/papers/kansas-city-advocate" class="deco-link">Kansas City Advocate</a></td><td style="padding:0.75rem 0.5rem;color:var(--text-secondary);">1916-1926</td><td style="text-align:right;padding:0.75rem 0.5rem;">1,064</td><td style="text-align:right;padding:0.75rem 0.5rem;">4,512</td></tr>
              <tr style="border-bottom:1px solid var(--border-color);"><td style="padding:0.75rem 0.5rem;"><a href="/papers/kansas-city-sun" class="deco-link">Kansas City Sun</a></td><td style="padding:0.75rem 0.5rem;color:var(--text-secondary);">1914-1920</td><td style="text-align:right;padding:0.75rem 0.5rem;">360</td><td style="text-align:right;padding:0.75rem 0.5rem;">2,906</td></tr>
              <tr style="border-bottom:1px solid var(--border-color);"><td style="padding:0.75rem 0.5rem;"><a href="/papers/metropolis-weekly-gazette" class="deco-link">Metropolis Weekly Gazette</a></td><td style="padding:0.75rem 0.5rem;color:var(--text-secondary);">1911-1922</td><td style="text-align:right;padding:0.75rem 0.5rem;">426</td><td style="text-align:right;padding:0.75rem 0.5rem;">1,723</td></tr>
              <tr style="border-bottom:1px solid var(--border-color);"><td style="padding:0.75rem 0.5rem;"><a href="/papers/montana-plaindealer" class="deco-link">Montana Plaindealer</a></td><td style="padding:0.75rem 0.5rem;color:var(--text-secondary);">1906-1911</td><td style="text-align:right;padding:0.75rem 0.5rem;">125</td><td style="text-align:right;padding:0.75rem 0.5rem;">504</td></tr>
              <tr style="border-bottom:1px solid var(--border-color);"><td style="padding:0.75rem 0.5rem;"><a href="/papers/muskogee-cimeter" class="deco-link">Muskogee Cimeter</a></td><td style="padding:0.75rem 0.5rem;color:var(--text-secondary);">1905-1920</td><td style="text-align:right;padding:0.75rem 0.5rem;">268</td><td style="text-align:right;padding:0.75rem 0.5rem;">1,788</td></tr>
              <tr style="border-bottom:1px solid var(--border-color);"><td style="padding:0.75rem 0.5rem;"><a href="/papers/nashville-globe" class="deco-link">Nashville Globe</a></td><td style="padding:0.75rem 0.5rem;color:var(--text-secondary);">1907-1918</td><td style="text-align:right;padding:0.75rem 0.5rem;">461</td><td style="text-align:right;padding:0.75rem 0.5rem;">3,816</td></tr>
              <tr style="border-bottom:1px solid var(--border-color);"><td style="padding:0.75rem 0.5rem;"><a href="/papers/negro-world" class="deco-link">Negro World</a></td><td style="padding:0.75rem 0.5rem;color:var(--text-secondary);">1921-1929</td><td style="text-align:right;padding:0.75rem 0.5rem;">407</td><td style="text-align:right;padding:0.75rem 0.5rem;">4,197</td></tr>
              <tr style="border-bottom:1px solid var(--border-color);"><td style="padding:0.75rem 0.5rem;"><a href="/papers/new-york-age" class="deco-link">New York Age</a></td><td style="padding:0.75rem 0.5rem;color:var(--text-secondary);">1905-1929</td><td style="text-align:right;padding:0.75rem 0.5rem;">1,290</td><td style="text-align:right;padding:0.75rem 0.5rem;">11,605</td></tr>
              <tr style="border-bottom:1px solid var(--border-color);"><td style="padding:0.75rem 0.5rem;"><a href="/papers/norfolk-journal-and-guide" class="deco-link">Norfolk Journal and Guide</a></td><td style="padding:0.75rem 0.5rem;color:var(--text-secondary);">1916-1926</td><td style="text-align:right;padding:0.75rem 0.5rem;">358</td><td style="text-align:right;padding:0.75rem 0.5rem;">3,599</td></tr>
              <tr style="border-bottom:1px solid var(--border-color);"><td style="padding:0.75rem 0.5rem;"><a href="/papers/omaha-monitor" class="deco-link">Omaha Monitor</a></td><td style="padding:0.75rem 0.5rem;color:var(--text-secondary);">1915-1928</td><td style="text-align:right;padding:0.75rem 0.5rem;">683</td><td style="text-align:right;padding:0.75rem 0.5rem;">3,786</td></tr>
              <tr style="border-bottom:1px solid var(--border-color);"><td style="padding:0.75rem 0.5rem;"><a href="/papers/phoenix-tribune" class="deco-link">Phoenix Tribune</a></td><td style="padding:0.75rem 0.5rem;color:var(--text-secondary);">1918-1929</td><td style="text-align:right;padding:0.75rem 0.5rem;">283</td><td style="text-align:right;padding:0.75rem 0.5rem;">1,416</td></tr>
              <tr style="border-bottom:1px solid var(--border-color);"><td style="padding:0.75rem 0.5rem;"><a href="/papers/pittsburgh-courier" class="deco-link">Pittsburgh Courier</a></td><td style="padding:0.75rem 0.5rem;color:var(--text-secondary);">1911-1924</td><td style="text-align:right;padding:0.75rem 0.5rem;">161</td><td style="text-align:right;padding:0.75rem 0.5rem;">1,864</td></tr>
              <tr style="border-bottom:1px solid var(--border-color);"><td style="padding:0.75rem 0.5rem;"><a href="/papers/portland-new-age" class="deco-link">Portland New Age</a></td><td style="padding:0.75rem 0.5rem;color:var(--text-secondary);">1905-1907</td><td style="text-align:right;padding:0.75rem 0.5rem;">51</td><td style="text-align:right;padding:0.75rem 0.5rem;">416</td></tr>
              <tr style="border-bottom:1px solid var(--border-color);"><td style="padding:0.75rem 0.5rem;"><a href="/papers/raleigh-independent" class="deco-link">Raleigh Independent</a></td><td style="padding:0.75rem 0.5rem;color:var(--text-secondary);">1918-1920</td><td style="text-align:right;padding:0.75rem 0.5rem;">3</td><td style="text-align:right;padding:0.75rem 0.5rem;">12</td></tr>
              <tr style="border-bottom:1px solid var(--border-color);"><td style="padding:0.75rem 0.5rem;"><a href="/papers/richmond-planet" class="deco-link">Richmond Planet</a></td><td style="padding:0.75rem 0.5rem;color:var(--text-secondary);">1905-1929</td><td style="text-align:right;padding:0.75rem 0.5rem;">1,260</td><td style="text-align:right;padding:0.75rem 0.5rem;">10,370</td></tr>
              <tr style="border-bottom:1px solid var(--border-color);"><td style="padding:0.75rem 0.5rem;"><a href="/papers/seattle-cayton's-weekly" class="deco-link">Seattle Cayton\u2019s Weekly</a></td><td style="padding:0.75rem 0.5rem;color:var(--text-secondary);">1917-1920</td><td style="text-align:right;padding:0.75rem 0.5rem;">170</td><td style="text-align:right;padding:0.75rem 0.5rem;">711</td></tr>
              <tr style="border-bottom:1px solid var(--border-color);"><td style="padding:0.75rem 0.5rem;"><a href="/papers/springfield-forum" class="deco-link">Springfield Forum</a></td><td style="padding:0.75rem 0.5rem;color:var(--text-secondary);">1906-1917</td><td style="text-align:right;padding:0.75rem 0.5rem;">394</td><td style="text-align:right;padding:0.75rem 0.5rem;">2,621</td></tr>
              <tr style="border-bottom:1px solid var(--border-color);"><td style="padding:0.75rem 0.5rem;"><a href="/papers/st-louis-argus" class="deco-link">St. Louis Argus</a></td><td style="padding:0.75rem 0.5rem;color:var(--text-secondary);">1915-1925</td><td style="text-align:right;padding:0.75rem 0.5rem;">394</td><td style="text-align:right;padding:0.75rem 0.5rem;">3,793</td></tr>
              <tr style="border-bottom:1px solid var(--border-color);"><td style="padding:0.75rem 0.5rem;"><a href="/papers/st-paul-appeal" class="deco-link">St. Paul Appeal</a></td><td style="padding:0.75rem 0.5rem;color:var(--text-secondary);">1905-1923</td><td style="text-align:right;padding:0.75rem 0.5rem;">983</td><td style="text-align:right;padding:0.75rem 0.5rem;">4,103</td></tr>
              <tr style="border-bottom:1px solid var(--border-color);"><td style="padding:0.75rem 0.5rem;"><a href="/papers/tulsa-star" class="deco-link">Tulsa Star</a></td><td style="padding:0.75rem 0.5rem;color:var(--text-secondary);">1913-1921</td><td style="text-align:right;padding:0.75rem 0.5rem;">209</td><td style="text-align:right;padding:0.75rem 0.5rem;">1,531</td></tr>
              <tr style="border-bottom:1px solid var(--border-color);"><td style="padding:0.75rem 0.5rem;"><a href="/papers/twin-city-star" class="deco-link">Twin City Star</a></td><td style="padding:0.75rem 0.5rem;color:var(--text-secondary);">1910-1919</td><td style="text-align:right;padding:0.75rem 0.5rem;">399</td><td style="text-align:right;padding:0.75rem 0.5rem;">1,983</td></tr>
              <tr style="border-bottom:1px solid var(--border-color);"><td style="padding:0.75rem 0.5rem;"><a href="/papers/washington-bee" class="deco-link">Washington Bee</a></td><td style="padding:0.75rem 0.5rem;color:var(--text-secondary);">1905-1922</td><td style="text-align:right;padding:0.75rem 0.5rem;">856</td><td style="text-align:right;padding:0.75rem 0.5rem;">6,898</td></tr>
              <tr style="border-bottom:1px solid var(--border-color);"><td style="padding:0.75rem 0.5rem;"><a href="/papers/washington-tribune" class="deco-link">Washington Tribune</a></td><td style="padding:0.75rem 0.5rem;color:var(--text-secondary);">1921-1929</td><td style="text-align:right;padding:0.75rem 0.5rem;">485</td><td style="text-align:right;padding:0.75rem 0.5rem;">4,368</td></tr>
              <tr style="border-bottom:1px solid var(--border-color);"><td style="padding:0.75rem 0.5rem;"><a href="/papers/western-outlook" class="deco-link">Western Outlook</a></td><td style="padding:0.75rem 0.5rem;color:var(--text-secondary);">1926-1928</td><td style="text-align:right;padding:0.75rem 0.5rem;">22</td><td style="text-align:right;padding:0.75rem 0.5rem;">172</td></tr>
              <tr style="border-bottom:1px solid var(--border-color);"><td style="padding:0.75rem 0.5rem;"><a href="/papers/wichita-searchlight" class="deco-link">Wichita Searchlight</a></td><td style="padding:0.75rem 0.5rem;color:var(--text-secondary);">1905-1912</td><td style="text-align:right;padding:0.75rem 0.5rem;">362</td><td style="text-align:right;padding:0.75rem 0.5rem;">2,453</td></tr>
              <tr style="border-bottom:1px solid var(--border-color);"><td style="padding:0.75rem 0.5rem;"><a href="/papers/wisconsin-weekly-blade" class="deco-link">Wisconsin Weekly Blade</a></td><td style="padding:0.75rem 0.5rem;color:var(--text-secondary);">1916-1922</td><td style="text-align:right;padding:0.75rem 0.5rem;">143</td><td style="text-align:right;padding:0.75rem 0.5rem;">618</td></tr>
            </tbody>
            <tfoot>
              <tr>
                <th style="text-align:left;padding:1rem 0.5rem;font-weight:700;font-size:1.1rem;color:var(--unc-longleaf-pine);">Total</th>
                <th style="padding:1rem 0.5rem;"></th>
                <th style="text-align:right;padding:1rem 0.5rem;font-weight:700;font-size:1.1rem;color:var(--unc-longleaf-pine);">20,911</th>
                <th style="text-align:right;padding:1rem 0.5rem;font-weight:700;font-size:1.1rem;color:var(--unc-longleaf-pine);">157,506</th>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section class="glass-card" style="border-radius:1rem;padding:2rem 3rem;margin-bottom:2rem;">
        <p style="font-size:1.05rem;line-height:1.7;color:var(--text-secondary);">
          The Dangerous Press archive is an ongoing project under active development. New newspapers and issues are being added regularly. If you have questions, suggestions, or encounter any issues, please contact <a href="mailto:neal.caren@gmail.com" class="deco-link">Neal Caren</a>.
        </p>
      </section>
    </div>
  `;

  return layout(
    {
      title: 'About',
      description: 'Learn about the Dangerous Press archive, a collection of over 20,000 digitized African American newspaper issues from 1905-1929.',
      canonicalUrl: 'https://dangerouspress.org/about',
      jsonLd,
      bodyClass: 'home-page',
      hideNav: true,
    },
    content,
  );
}
