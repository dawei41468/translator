import BottomNav from "./BottomNav";

interface LayoutProps {
  children: React.ReactNode;
  showBottomNav?: boolean;
}

const Layout = ({ children, showBottomNav = true }: LayoutProps) => {
  return (
    <div className={showBottomNav ? "min-h-[100dvh] bg-background" : "h-[100dvh] max-h-[100svh] bg-background overflow-hidden"}>
      <main className={showBottomNav ? "pb-16" : "h-full overflow-hidden"}>
        {children}
      </main>
      {showBottomNav && <BottomNav />}
    </div>
  );
};

export default Layout;