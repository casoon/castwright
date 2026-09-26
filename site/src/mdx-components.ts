// Components the docs' MDX can use without importing them (theme option
// `mdxComponents`): docs/ sits outside site/ and cannot reach compiled demos.
import Cast from './components/Cast.astro';

export const components = { Cast };
