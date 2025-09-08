import { defaultColors, defineConfig } from 'histoire';
import { HstSvelte } from '@histoire/plugin-svelte';

export default defineConfig({
	plugins: [HstSvelte()],
	theme: {
		title: 'Histoire',
		logo: {
			square: './static/favicons/me_cartoon_192x192.png',
			light: './static/favicons/me_cartoon_192x192.png',
			dark: './static/favicons/me_cartoon_192x192.png'
		},
		favicon: './static/favicons/me_cartoon.ico',
		colors: {
			primary: defaultColors.purple
		}
	}
});
