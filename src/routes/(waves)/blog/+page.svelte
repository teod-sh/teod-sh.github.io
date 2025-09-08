<script lang="ts">
	import BlogPostCard from '$lib/components/molecules/BlogPostCard.svelte';
	import ContentSection from '$lib/components/organisms/ContentSection.svelte';
	import Tag from '$lib/components/atoms/Tag.svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import type { BlogPost } from '$lib/utils/types';

	export let data: {
		posts: BlogPost[];
	};

	let { posts } = data;
	// Filter state
	let selectedTags: string[] = [];
	let filteredPosts = posts;
	
	// Search state
	let searchQuery = '';
	let showSearchResults = false;
	let searchResults: string[] = [];
	
	// Define the 3 specific tags you want to show (replace with your actual tags)
	const featuredTags = ['Python', 'System Design', 'DIY']; // Update these with your actual tags

	// Initialize selectedTags from URL parameters
	$: if (browser && $page.url.searchParams.has('tags')) {
		const urlTags = $page.url.searchParams.get('tags');
		if (urlTags) {
			selectedTags = urlTags.split(',').filter(tag => tag.trim());
		}
	}

	// Update URL when selectedTags changes
	function updateURL() {
		if (!browser) return;
		
		const url = new URL($page.url);
		if (selectedTags.length > 0) {
			url.searchParams.set('tags', selectedTags.join(','));
		} else {
			url.searchParams.delete('tags');
		}
		goto(url, { replaceState: true, noScroll: true });
	}

	// Extract all unique tags from posts
	$: allTags = Array.from(new Set(posts.flatMap(post => post.tags || []))).sort();
	
	// Filter featured tags to only show ones that actually exist in posts
	$: availableFeaturedTags = featuredTags.filter(tag => allTags.includes(tag));
	
	// Search functionality
	$: {
		if (searchQuery.trim()) {
			searchResults = allTags
				.filter(tag => 
					tag.toLowerCase().includes(searchQuery.toLowerCase()) && 
					!featuredTags.includes(tag) // Exclude featured tags from search results
				)
				.slice(0, 10); // Limit to 10 results
			showSearchResults = searchResults.length > 0;
		} else {
			searchResults = [];
			showSearchResults = false;
		}
	}

	// Filter posts based on selected tags
	$: {
		if (selectedTags.length === 0) {
			filteredPosts = posts;
		} else {
			filteredPosts = posts.filter(post =>
				selectedTags.every(tag => post.tags?.includes(tag))
			);
		}
	}

	function toggleTag(tag: string) {
		if (selectedTags.includes(tag)) {
			selectedTags = selectedTags.filter(t => t !== tag);
		} else {
			selectedTags = [...selectedTags, tag];
		}
	}
	
	function selectTagFromSearch(tag: string) {
		searchQuery = '';
		showSearchResults = false;
		if (!selectedTags.includes(tag)) {
			selectedTags = [...selectedTags, tag];
			updateURL();
		}
	}

	function clearFilters() {
		selectedTags = [];
		updateURL();
	}
	
	function handleSearchFocus() {
		if (searchQuery.trim() && searchResults.length > 0) {
			showSearchResults = true;
		}
	}
	
	function handleSearchBlur() {
		// Delay hiding to allow for click events on search results
		setTimeout(() => {
			showSearchResults = false;
		}, 200);
	}

</script>

<div class="container">
	<div class="content-section-wrapper">
		<ContentSection title="All Blog Posts">
			<!-- Tag Filter Section -->
			<div class="filter-section">
				<div class="filter-header">
					<h3>Filter by Tags</h3>
				</div>
				
				<!-- Featured Tags -->
				<div class="featured-tags-section">
					<h4>Popular Tags</h4>
					<div class="tag-filters">
						{#each availableFeaturedTags as tag}
							<button 
								class="tag-filter"
								on:click={() => toggleTag(tag)}
							>
								<Tag>{tag}</Tag>
							</button>
						{/each}
					</div>
				</div>
				
				<!-- Search Section -->
				<div class="search-section">
					<h4>Search for More Tags</h4>
					{#if selectedTags.length > 0}
						<button class="clear-filters" on:click={clearFilters}>
							Clear Filters ({selectedTags.length})
						</button>
					{/if}
					<div class="search-container">
						<input 
							type="text" 
							placeholder="Type to search for tags..."
							bind:value={searchQuery}
							on:focus={handleSearchFocus}
							on:blur={handleSearchBlur}
							class="search-input"
						/>

						{#if showSearchResults}
							<div class="search-results">
								{#each searchResults as tag}
									<button 
										class="search-result-item"
										on:click={() => selectTagFromSearch(tag)}
									>
										<Tag>{tag}</Tag>
									</button>
								{/each}
							</div>
						{/if}
						
						{#if searchQuery.trim() && searchResults.length === 0 && !showSearchResults}
							<div class="no-search-results">
								No tags found matching "{searchQuery}"
							</div>
						{/if}
					</div>
				</div>
				
				{#if selectedTags.length > 0}
					<div class="selected-filters">
						<span class="filter-label">Active filters:</span>
						{#each selectedTags as tag}
							<button class="selected-tag" on:click={() => toggleTag(tag)}>
								<Tag>{tag}</Tag>
								<span class="remove">×</span>
							</button>
						{/each}
					</div>
				{/if}
				
				<div class="results-count">
					Showing {filteredPosts.length} of {posts.length} posts
				</div>
			</div>

			<!-- Posts Grid -->
			<div class="grid">
				{#each filteredPosts as post}
					<BlogPostCard
						title={post.title}
						coverImage={post.coverImage}
						excerpt={post.excerpt}
						readingTime={post.readingTime}
						slug={post.slug}
						tags={post.tags}
					/>
				{/each}
			</div>
			
			{#if filteredPosts.length === 0}
				<div class="no-results">
					<h3>No posts found</h3>
					<p>Try removing some filters or browse all posts.</p>
					<button class="clear-filters-btn" on:click={clearFilters}>
						Show All Posts
					</button>
				</div>
			{/if}
		</ContentSection>
	</div>
</div>

<style lang="scss">
	@import '$lib/scss/_mixins.scss';

	.content-section-wrapper {
		// Add top padding to push content down from header
		padding-top: 100px;
		
		@include for-tablet-portrait-down {
			padding-top: 40px;
		}
		
		@include for-iphone-se {
			padding-top: 20px;
		}
	}

	.filter-section {
		margin-bottom: 80px;
		padding: 20px;
		background: rgba(var(--color--text-rgb), 0.05);
		border-radius: 8px;
		border: 1px solid rgba(var(--color--text-rgb), 0.1);
		position: relative;
		z-index: 10;
		min-width: 100%;
		
		.filter-header {
			display: flex;
			//align-items: center;
			justify-content: center;
			margin-bottom: 20px;
			
			h3 {
				margin: 0;
				font-size: 1.2rem;
			}
		}
		
		.featured-tags-section {
			margin-bottom: 24px;
			
			h4 {
				margin: 0 0 12px 0;
				font-size: 1rem;
				color: rgba(var(--color--text-rgb), 0.8);
			}
			
			.tag-filters {
				display: flex;
				justify-content: space-between;
				align-items: center;
				gap: 8px;
				min-height: 40px; // Ensure consistent height
				width: 100%;
				
				@include for-tablet-portrait-down {
					justify-content: center;
					flex-wrap: wrap;
				}
				
				.tag-filter {
					background: none;
					border: none;
					cursor: pointer;
					transition: all 0.2s ease;
					border-radius: 4px;
					padding: 2px;
					position: relative;
					z-index: 3;
					flex: 1; // Make each tag take equal space
					display: flex;
					justify-content: center;
					align-items: center;
					//min-width: 120px; // Minimum width for each tag button
					
					@include for-tablet-portrait-down {
						flex: none;
						min-width: auto;
					}
					
					&:hover {
						transform: scale(1.05);
						background: rgba(var(--color--primary-rgb), 0.1);
					}
				}
			}
		}
		
		.search-section {
			margin-bottom: 24px;
			
			h4 {
				margin: 0 0 12px 0;
				font-size: 1rem;
				color: rgba(var(--color--text-rgb), 0.8);
			}
			
			.search-container {
				position: relative;
			}

			.clear-filters {
				padding: 6px 12px;
				margin-bottom: 10px;
				background: rgba(var(--color--primary-rgb), 0.1);
				color: var(--color--primary);
				border: 1px solid var(--color--primary);
				border-radius: 4px;
				font-size: 0.9rem;
				cursor: pointer;
				transition: all 0.2s ease;
				position: relative;
				z-index: 2;

				&:hover {
					background: var(--color--primary);
					color: var(--color--primary-contrast);
				}
			}
			
			.search-input {
				width: 100%;
				padding: 10px 12px;
				border: 1px solid rgba(var(--color--text-rgb), 0.3);
				border-radius: 6px;
				background: var(--color--background);
				color: var(--color--text);
				font-size: 0.95rem;
				transition: border-color 0.2s ease;
				
				&:focus {
					outline: none;
					border-color: var(--color--primary);
				}
				
				&::placeholder {
					color: rgba(var(--color--text-rgb), 0.5);
				}
			}
			
			.search-results {
				position: absolute;
				top: 100%;
				left: 0;
				right: 0;
				background: var(--color--background);
				border: 1px solid rgba(var(--color--text-rgb), 0.3);
				border-top: none;
				border-radius: 0 0 6px 6px;
				box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
				max-height: 200px;
				overflow-y: auto;
				z-index: 100;
				
				.search-result-item {
					display: block;
					width: 100%;
					padding: 8px 12px;
					background: none;
					border: none;
					text-align: left;
					cursor: pointer;
					transition: background-color 0.2s ease;
					border-bottom: 1px solid rgba(var(--color--text-rgb), 0.1);
					
					&:hover {
						background: rgba(var(--color--primary-rgb), 0.1);
					}
					
					&:last-child {
						border-bottom: none;
					}
				}
			}
			
			.no-search-results {
				position: absolute;
				top: 100%;
				left: 0;
				right: 0;
				background: var(--color--background);
				border: 1px solid rgba(var(--color--text-rgb), 0.3);
				border-top: none;
				border-radius: 0 0 6px 6px;
				padding: 12px;
				font-size: 0.9rem;
				color: rgba(var(--color--text-rgb), 0.6);
				z-index: 100;
			}
		}
		
		.tag-filters {
			display: flex;
			flex-wrap: wrap;
			gap: 8px;
			position: relative;
			z-index: 2;
			
			// This applies to the general tag-filters, but the featured section overrides it
			.tag-filter {
				background: none;
				border: none;
				cursor: pointer;
				transition: all 0.2s ease;
				border-radius: 4px;
				padding: 2px;
				position: relative;
				z-index: 3;
				
				&:hover {
					transform: scale(1.05);
					background: rgba(var(--color--primary-rgb), 0.1);
				}
				
				&.active {
					background: rgba(var(--color--primary-rgb), 0.2);
					transform: scale(1.05);
				}
			}
		}
		
		.selected-filters {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: 8px;
			margin-bottom: 16px;
			padding-top: 12px;
			border-top: 1px solid rgba(var(--color--text-rgb), 0.1);
			position: relative;
			z-index: 2;
			
			.filter-label {
				font-size: 0.9rem;
				color: rgba(var(--color--text-rgb), 0.7);
				font-weight: 600;
			}
			
			.selected-tag {
				display: flex;
				align-items: center;
				gap: 4px;
				background: var(--color--primary);
				color: var(--color--primary-contrast);
				border: none;
				border-radius: 4px;
				padding: 4px 8px;
				cursor: pointer;
				transition: all 0.2s ease;
				position: relative;
				z-index: 3;
				
				&:hover {
					background: rgba(var(--color--primary-rgb), 0.8);
				}
				
				.remove {
					font-size: 1.2rem;
					line-height: 1;
					margin-left: 4px;
				}
			}
		}
		
		.results-count {
			font-size: 0.9rem;
			color: rgba(var(--color--text-rgb), 0.7);
			font-weight: 500;
			position: relative;
			z-index: 2;
		}
	}

	// Ensure the container has proper positioning
	.container {
		position: relative;
		z-index: 1;
	}

	.grid {
		width: 100%;
		display: grid;
		grid-template-columns: 1fr 1fr 1fr 1fr 1fr 1fr;
		grid-gap: 20px;
		position: relative;
		z-index: 1;

		@include for-tablet-portrait-down {
			grid-template-columns: 1fr;
		}

		@include for-tablet-landscape-up {
			// Select every 6 elements, starting from position 1
			// And make it take up 6 columns
			> :global(:nth-child(6n + 1)) {
				grid-column: span 6;
			}
			// Select every 6 elements, starting from position 2
			// And make it take up 3 columns
			> :global(:nth-child(6n + 2)) {
				grid-column: span 3;
			}
			// Select every 6 elements, starting from position 3
			// And make it take up 3 columns
			> :global(:nth-child(6n + 3)) {
				grid-column: span 3;
			}
			// Select every 6 elements, starting from position 4, 5 and 6
			// And make it take up 2 columns
			> :global(:nth-child(6n + 4)),
			:global(:nth-child(6n + 5)),
			:global(:nth-child(6n + 6)) {
				grid-column: span 2;
			}
		}
	}
	
	.no-results {
		text-align: center;
		padding: 60px 20px;
		color: rgba(var(--color--text-rgb), 0.7);
		position: relative;
		z-index: 1;
		
		h3 {
			margin-bottom: 12px;
			color: var(--color--text);
		}
		
		p {
			margin-bottom: 24px;
		}
		
		.clear-filters-btn {
			padding: 12px 24px;
			background: var(--color--primary);
			color: var(--color--primary-contrast);
			border: none;
			border-radius: 6px;
			cursor: pointer;
			font-size: 1rem;
			transition: all 0.2s ease;
			position: relative;
			z-index: 2;
			
			&:hover {
				background: rgba(var(--color--primary-rgb), 0.8);
				transform: translateY(-2px);
			}
		}
	}
</style>
