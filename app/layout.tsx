import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { Building2 } from 'lucide-react';

import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './globals.css';

const NAME = '재개발나우';
const TITLE = `${NAME} — 서울·경기 재개발·재건축 지도와 추진단계`;
const DESCRIPTION =
  '서울·경기의 재개발·재건축·재정비촉진·모아타운·가로주택 정비구역을 지도에서 보고, 구역별 추진단계와 진행 이력, 조합 입찰공고를 확인합니다.';

export const metadata: Metadata = {
  metadataBase: new URL('https://kr-redev-now.vercel.app'),
  title: { default: TITLE, template: `%s — ${NAME}` },
  description: DESCRIPTION,
  applicationName: NAME,
  openGraph: { title: TITLE, description: DESCRIPTION, siteName: NAME, type: 'website', locale: 'ko_KR' },
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
  colorScheme: 'light',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-white font-sans text-[#191F28]">
        <header className="sticky top-0 z-20 border-b border-[#F2F4F6] bg-white/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <span className="grid size-7 place-items-center rounded-lg bg-primary text-white">
                <Building2 className="size-4" aria-hidden />
              </span>
              {NAME}
            </Link>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-4">{children}</main>
        <footer className="border-t border-[#F2F4F6] bg-[#F9FAFB] py-6 text-center text-xs text-muted-foreground">
          데이터 출처: 서울특별시 (서울 열린데이터광장) · 경기도 (경기데이터드림). 구역·단계는 참고용 행정자료로 실제 사업 현황과 다를 수 있으니 투자·거래 판단은 해당 조합·구청에 확인하세요.
          <br />
          <a className="underline underline-offset-2" href="https://github.com/seongilp/kr-redev-now">
            GitHub
          </a>
        </footer>
      </body>
    </html>
  );
}
