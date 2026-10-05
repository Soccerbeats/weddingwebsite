/*
 * The honeymoon portal's worker became the site-wide one in v0.10.3.
 *
 * Phones that registered this file before then keep checking it for updates,
 * so it simply loads `/sw.js`: they get the whole-site offline behaviour without
 * anyone re-registering anything. New registrations use `/sw.js` directly.
 */
importScripts('/sw.js');
