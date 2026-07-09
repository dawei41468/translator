import BottomNav from "./BottomNav";

interface LayoutProps {
  children: React.ReactNode;
  showBottomNav?: boolean;
}

const Layout = ({ children, showBottomNav = true }: LayoutProps) => {
  return (
    <div
      className={
        showBottomNav
          ? "min-h-[100dvh] bg-background"
          : "h-[100dvh] max-h-[100svh] bg-background overflow-hidden"
      }
      style={
        showBottomNav
          ? undefined
          : {
              paddingTop: "env(safe-area-inset-top)",
              paddingBottom: "env(safe-area-inset-bottom)",
            }
      }
    >
      <main
        className={showBottomNav ? "pb-[calc(4rem+env(safe-area-inset-bottom))]" : "h-full overflow-hidden"}
      >
        {children}
      </main>
      {showBottomNav && <BottomNav />}
    </div>
  );
};

export default Layout;