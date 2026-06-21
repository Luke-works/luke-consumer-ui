import { Link } from "react-router";
import { Menu } from "lucide-react";
import { useSidebar } from "../context/SidebarContext";

// Mobile-only bar: the desktop navbar is gone (its controls moved to the sidebar
// footer). On small screens this just provides a way to open the sidebar drawer.
const AppHeader: React.FC = () => {
  const { toggleMobileSidebar } = useSidebar();

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-gray-200 bg-white px-3 py-3 dark:border-gray-800 dark:bg-gray-900 lg:hidden">
      <button
        onClick={toggleMobileSidebar}
        aria-label="Open menu"
        className="flex size-10 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-gray-800"
      >
        <Menu className="size-5" />
      </button>
      <Link to="/" className="flex items-center">
        <img className="dark:hidden" src="/images/logo/logo.svg" alt="Lukeflow" height={28} />
        <img className="hidden dark:block" src="/images/logo/logo-dark.svg" alt="Lukeflow" height={28} />
      </Link>
    </header>
  );
};

export default AppHeader;
