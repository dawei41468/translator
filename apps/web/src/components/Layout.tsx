import BottomNav from "./BottomNav";

interface LayoutProps {
  children: React.ReactNode;
  showBottomNav?: boolean;
}

const Layout = ({ children, showBottomNav = true }: LayoutProps) => {
  return (
    <div className="min-h-screen bg-background">
      <main className={showBottomNav ? "pb-16" : ""}>
        {children}
      </main>
      {showBottomNav && <BottomNav />}
    </div>
  );
};

export default Layout;