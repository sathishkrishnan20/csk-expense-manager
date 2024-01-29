export const PrivacyPolicyComponent = () => {
  return (

    <footer className="bg-white  shadow  dark:bg-gray-800">
      <div className="w-full mx-auto max-w-screen-xl p-4 flex items-center justify-between">
        <span className="text-sm text-gray-500 sm:text-center dark:text-gray-400">© 2023 <a href="#" className="hover:underline">CSK™</a>
      </span>
      <ul className="flex flex-wrap items-center mt-3 text-sm font-medium text-gray-500 dark:text-gray-400 sm:mt-0">
        <li>
            <a href="/privacy-policy" className="hover:underline me-4 md:me-6">Privacy Policy</a>
        </li>
        <li>
            <a href="/terms-services" className="hover:underline me-4 md:me-6">Terms and Services</a>
        </li>
      </ul>
    </div>
</footer>
    
  );
};
