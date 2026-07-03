import { SidebarProvider, useSidebar } from "../context/SidebarContext";
import { Outlet } from "react-router";
import AppHeader from "./AppHeader";
import Backdrop from "./Backdrop";
import AppSidebar from "./AppSidebar";

const LayoutContent: React.FC = () => {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();

  return (
    <div className="min-h-screen lg:flex">
      {/* Keyboard/AT users can jump straight to the page content, past the sidebar nav. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg dark:focus:bg-gray-900 dark:focus:text-white"
      >
        Skip to content
      </a>
      <div>
        <AppSidebar />
        <Backdrop />
      </div>
      {/* Header + content track the sidebar's *current* width — including the
          hover-expanded state — so the app header never overlaps the sidebar
          (which would clip the logo, since the header stacks above it). */}
      <div
        className={`flex-1 transition-all duration-300 ease-in-out ${
          isExpanded || isHovered ? "lg:ml-[256px]" : "lg:ml-[76px]"
        } ${isMobileOpen ? "ml-0" : ""}`}
      >
        <AppHeader />
        <main id="main-content" className="p-4 mx-auto max-w-(--breakpoint-2xl) md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

const AppLayout: React.FC = () => {
  return (
    <SidebarProvider>
      <LayoutContent />
    </SidebarProvider>
  );
};

export default AppLayout;
