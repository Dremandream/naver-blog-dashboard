/**
 * RSS 피드 테스트 (3개 블로그)
 * 실행: node scripts/test-rss.js
 */

import https from 'https';

const BLOGS = [
  { id: 'keumssoa', name: '금싸' },
  { id: 'audistar', name: '콤디티' },
  { id: 'doctordk', name: '의교창' },
];

function fetchRSS(blogId) {
  return new Promise((resolve, reject) => {
    https.get(`https://rss.blog.naver.com/${blogId}.xml`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parseLatestPost(xml, blogId) {
  const titleMatch = xml.match(/<item>[\s\S]*?<title><!\[CDATA\[(.*?)\]\]><\/title>/);
  const linkMatch = xml.match(/<item>[\s\S]*?<link><!\[CDATA\[(.*?)\]\]><\/link>/);
  const descMatch = xml.match(/<item>[\s\S]*?<description><!\[CDATA\[(.*?)\]\]><\/description>/);
  const dateMatch = xml.match(/<item>[\s\S]*?<pubDate>(.*?)<\/pubDate>/);

  return {
    blog_id: blogId,
    title: titleMatch?.[1] || '(없음)',
    url: linkMatch?.[1] || '',
    description: descMatch?.[1]?.replace(/<[^>]+>/g, '').slice(0, 100) || '',
    pubDate: dateMatch?.[1] || '',
  };
}

async function main() {
  console.log('=== RSS 피드 테스트 ===\n');

  for (const blog of BLOGS) {
    try {
      const xml = await fetchRSS(blog.id);
      const post = parseLatestPost(xml, blog.id);
      console.log(`✅ ${blog.name} (${blog.id})`);
      console.log(`   제목: ${post.title}`);
      console.log(`   날짜: ${post.pubDate}`);
      console.log(`   URL : ${post.url}`);
      console.log(`   내용: ${post.description}...`);
      console.log();
    } catch (e) {
      console.log(`❌ ${blog.name} (${blog.id}): ${e.message}\n`);
    }
  }
}

main();
