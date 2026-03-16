import { layout } from './layout';

export function aboutPage(): string {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: 'Dangerous Press — African American Newspapers Archive',
    description:
      'A digitized archive of African American newspapers published between 1905 and 1929, with full-text OCR search.',
    url: 'https://dangerouspress.com',
    temporalCoverage: '1905/1929',
    inLanguage: 'en',
    license: 'https://creativecommons.org/publicdomain/zero/1.0/',
    publisher: {
      '@type': 'Organization',
      name: 'Dangerous Press',
      url: 'https://dangerouspress.com',
    },
  };

  const content = `
    <div class="about-page">
      <h1>About Dangerous Press</h1>
      <div class="about-content prose">
        <p>
          Dangerous Press is a digitized archive of African American newspapers published
          between 1905 and 1929 — a pivotal era spanning the Great Migration, World War I,
          and the Harlem Renaissance.
        </p>
        <h2>The Collection</h2>
        <p>
          The archive brings together newspapers from across the United States,
          preserving the voices and perspectives of Black communities during a
          transformative period in American history. The collection includes major
          publications as well as smaller regional papers that documented everyday
          life, politics, culture, and resistance.
        </p>
        <h2>Full-Text Search</h2>
        <p>
          Every page in the archive has been processed with optical character recognition
          (OCR), enabling full-text search across millions of pages. You can search for
          names, places, events, and ideas that appear anywhere in the archive.
        </p>
        <h2>How to Cite</h2>
        <p>
          When citing materials from this archive, please include the newspaper title,
          publication date, page number, and the URL of the page on Dangerous Press.
        </p>
        <h2>Technical Notes</h2>
        <p>
          The archive is built on digitized microfilm scans. Image quality varies by
          publication and date. OCR accuracy is generally high for well-preserved issues
          but may be lower for damaged or faded pages.
        </p>
        <h2>Contact</h2>
        <p>
          For questions, corrections, or contributions, please visit our
          <a href="https://github.com/dangerouspress">GitHub repository</a>.
        </p>
      </div>
    </div>
  `;

  return layout(
    {
      title: 'About',
      description:
        'Learn about the Dangerous Press archive of African American newspapers from 1905 to 1929.',
      canonicalUrl: 'https://dangerouspress.com/about',
      jsonLd,
      bodyClass: 'about-page',
    },
    content,
  );
}
