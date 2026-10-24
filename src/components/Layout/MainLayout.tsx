import {
  ListBulletIcon as SolidListBulletIcon,
  PlusCircleIcon as SolidPlusCircleIcon,
  ChartPieIcon as SolidScaleIcon,
  UserCircleIcon as SolidUserCircleIcon,
  UserGroupIcon as SolidUserGroupIcon,
} from '@heroicons/react/24/solid';
import { clsx } from 'clsx';
import { type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import React from 'react';
import { LoadingSpinner } from '../ui/spinner';

const mainLayoutScrollPositions = new Map<string, { mainLayout: number; window: number }>();
const SCROLL_RESTORE_TIMEOUT_MS = 2000;

interface MainLayoutProps {
  title?: React.ReactNode;
  children: React.ReactNode;
  actions?: React.ReactNode;
  header?: React.ReactNode;
  loading?: boolean;
  hideAppBar?: boolean;
}

const MainLayout: React.FC<MainLayoutProps> = ({
  children,
  actions,
  hideAppBar,
  title,
  loading,
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const currentPath = router.pathname;
  const mainLayoutRef = React.useRef<HTMLDivElement>(null);
  const scrollContentRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const mainLayout = mainLayoutRef.current;
    const scrollContent = scrollContentRef.current;

    if (!mainLayout || !scrollContent) {
      return undefined;
    }

    const asPath = router.asPath;
    const storedScrollPosition = mainLayoutScrollPositions.get(asPath);
    const startedAt = Date.now();
    let restoredScrollPosition = false;
    let scrollRestorationCancelled = false;
    let routeChangeStarted = false;

    const restoreScrollPosition = () => {
      if (
        storedScrollPosition === undefined ||
        restoredScrollPosition ||
        scrollRestorationCancelled
      ) {
        return;
      }

      mainLayout.scrollTop = storedScrollPosition.mainLayout;
      window.scrollTo(0, storedScrollPosition.window);

      if (mainLayout.scrollTop === storedScrollPosition.mainLayout) {
        restoredScrollPosition = true;
        resizeObserver.disconnect();
      }

      if (SCROLL_RESTORE_TIMEOUT_MS < Date.now() - startedAt) {
        resizeObserver.disconnect();
      }
    };

    const resizeObserver = new ResizeObserver(restoreScrollPosition);
    const cancelScrollRestoration = () => {
      if (restoredScrollPosition) {
        return;
      }

      scrollRestorationCancelled = true;
      resizeObserver.disconnect();
    };

    resizeObserver.observe(scrollContent);
    const animationFrameId = requestAnimationFrame(restoreScrollPosition);
    const restoreTimeoutIds = [100, 300, 700, 1200, 2000].map((delayMs) =>
      window.setTimeout(restoreScrollPosition, delayMs),
    );

    const saveCurrentScrollPosition = () => {
      if (routeChangeStarted) {
        return;
      }

      mainLayoutScrollPositions.set(asPath, {
        mainLayout: mainLayout.scrollTop,
        window: window.scrollY,
      });
    };

    const handleRouteChangeStart = () => {
      saveCurrentScrollPosition();
      routeChangeStarted = true;
    };
    const handleRouteChangeError = () => {
      routeChangeStarted = false;
    };

    mainLayout.addEventListener('scroll', saveCurrentScrollPosition, { passive: true });
    mainLayout.addEventListener('wheel', cancelScrollRestoration, { passive: true });
    mainLayout.addEventListener('touchstart', cancelScrollRestoration, { passive: true });
    window.addEventListener('scroll', saveCurrentScrollPosition, { passive: true });
    router.events.on('routeChangeStart', handleRouteChangeStart);
    router.events.on('routeChangeError', handleRouteChangeError);
    window.addEventListener('beforeunload', saveCurrentScrollPosition);

    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(animationFrameId);
      restoreTimeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
      saveCurrentScrollPosition();
      mainLayout.removeEventListener('scroll', saveCurrentScrollPosition);
      mainLayout.removeEventListener('wheel', cancelScrollRestoration);
      mainLayout.removeEventListener('touchstart', cancelScrollRestoration);
      window.removeEventListener('scroll', saveCurrentScrollPosition);
      router.events.off('routeChangeStart', handleRouteChangeStart);
      router.events.off('routeChangeError', handleRouteChangeError);
      window.removeEventListener('beforeunload', saveCurrentScrollPosition);
    };
  }, [router.asPath, router.events]);

  return (
    <div className="bg-background h-full w-full">
      <div
        vaul-drawer-wrapper=""
        className={clsx(
          'bg-background mx-auto flex h-full w-full flex-col lg:max-w-3xl lg:flex-row',
          hideAppBar ? '' : '',
        )}
      >
        <nav className="item-center -ml-[170px] hidden w-[170px] px-4 py-4 lg:flex lg:flex-col lg:gap-2">
          <Link href="/balances" className="mb-8 flex items-center gap-2">
            <span className="text-xl font-medium">
              {t?.('meta.application_name') ?? 'SplitPro'}
            </span>
          </Link>
          <NavItemDesktop
            title={t?.('navigation.balances') ?? 'Balances'}
            Icon={SolidScaleIcon}
            link="/balances"
            currentPath={currentPath}
          />
          <NavItemDesktop
            title={t?.('navigation.groups') ?? 'Groups'}
            Icon={SolidUserGroupIcon}
            link="/groups"
            currentPath={currentPath}
          />
          <NavItemDesktop
            title={t?.('navigation.add_expense') ?? 'Add Expense'}
            Icon={SolidPlusCircleIcon}
            link="/add"
            currentPath={currentPath}
          />
          <NavItemDesktop
            title={t?.('navigation.activity') ?? 'Activity'}
            Icon={SolidListBulletIcon}
            link="/activity"
            currentPath={currentPath}
          />
          <NavItemDesktop
            title={t?.('navigation.account') ?? 'Account'}
            Icon={SolidUserCircleIcon}
            link="/account"
            currentPath={currentPath}
          />
        </nav>
        <div
          ref={mainLayoutRef}
          className="w-full overflow-auto lg:border-x lg:border-gray-900 lg:px-6"
          id="mainlayout"
        >
          {title ? (
            <div className="mb-2 flex items-center justify-between px-4 py-4">
              <div className="text-3xl font-bold text-gray-200">{title}</div>
              {actions}
            </div>
          ) : null}
          <div className="px-4" ref={scrollContentRef}>
            {loading ? (
              <div className="mt-10 flex justify-center">
                <LoadingSpinner className="text-primary" />
              </div>
            ) : (
              children
            )}
          </div>
          <div className="h-28 lg:h-0" />
        </div>
      </div>

      <nav className="bg-opacity-80 fixed bottom-0 flex w-full justify-between border-t px-2 pb-4 shadow-xs backdrop-blur-lg lg:hidden">
        <NavItem
          title={t?.('navigation.balances') ?? 'Balances'}
          Icon={SolidScaleIcon}
          link="/balances"
          currentPath={currentPath}
        />
        <NavItem
          title={t?.('navigation.groups') ?? 'Groups'}
          Icon={SolidUserGroupIcon}
          link="/groups"
          currentPath={currentPath}
        />
        <NavItem
          title={t?.('navigation.add') ?? 'Add'}
          Icon={SolidPlusCircleIcon}
          link="/add"
          currentPath={currentPath}
        />
        <NavItem
          title={t?.('navigation.activity') ?? 'Activity'}
          Icon={SolidListBulletIcon}
          link="/activity"
          currentPath={currentPath}
        />
        <NavItem
          title={t?.('navigation.account') ?? 'Account'}
          Icon={SolidUserCircleIcon}
          link="/account"
          currentPath={currentPath}
        />
      </nav>
    </div>
  );
};

interface NavItemProps {
  title: string;
  Icon: LucideIcon;
  link: string;
  currentPath?: string;
}

const NavItem: React.FC<NavItemProps> = ({ title, Icon, link, currentPath }) => {
  const isActive = currentPath?.startsWith(link);

  return (
    <Link
      href={link}
      className={clsx('flex w-32 flex-col items-center justify-between gap-2 py-4')}
    >
      <Icon className={clsx('h-7 w-7', isActive ? 'text-cyan-500' : 'text-gray-600')} />
      <span className={clsx('text-xs', isActive ? 'font-medium text-cyan-500' : 'text-gray-500')}>
        {title}
      </span>
    </Link>
  );
};

const NavItemDesktop: React.FC<NavItemProps> = ({ title, Icon, link, currentPath }) => {
  const isActive = currentPath?.startsWith(link);

  return (
    <Link href={link} className={clsx('flex w-[150px] items-center gap-2 py-4')}>
      <Icon className={clsx('h-7 w-7', isActive ? 'text-cyan-500' : 'text-gray-600')} />
      <span
        className={clsx('capitalize', isActive ? 'font-medium text-cyan-500' : 'text-gray-500')}
      >
        {title}
      </span>
    </Link>
  );
};
export default MainLayout;
