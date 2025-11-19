<?php
/**
 * Plugin Name: AI Dream Jobs
 * Description: Students enter 5 dream jobs, rank them, then get AI-powered career feedback & chat. Use shortcode [ai_dream_jobs].
 * Version: 4.0.4
 * Author: MisterT9007
 */

if ( ! defined( 'ABSPATH' ) ) exit;

class AI_Dream_Jobs {
    const VERSION      = '4.0.4';
    const TABLE        = 'ai_dream_jobs_results';
    const NONCE_ACTION = 'ai_dream_jobs_nonce';

    public function __construct() {
        register_activation_hook( __FILE__, array( $this, 'on_activate' ) );
        add_action( 'init', array( $this, 'register_assets' ) );
        add_shortcode( 'ai_dream_jobs', array( $this, 'shortcode' ) );
        add_action( 'rest_api_init', array( $this, 'register_routes' ) );
    }

    public function on_activate() {
        global $wpdb;
        $table = $wpdb->prefix . self::TABLE;
        $charset = $wpdb->get_charset_collate();

        $sql = "CREATE TABLE IF NOT EXISTS $table (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            user_id BIGINT UNSIGNED NULL,
            user_name VARCHAR(191) NULL,
            user_email VARCHAR(191) NULL,
            answers LONGTEXT NULL,
            ranking LONGTEXT NULL,
            top3 LONGTEXT NULL,
            analysis LONGTEXT NULL,
            ua VARCHAR(255) NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        ) $charset;";

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        dbDelta($sql);
    }

    public function register_assets() {
        $handle = 'ai-dream-jobs';
        wp_register_script(
            $handle,
            plugins_url( 'assets/ai-dream-jobs.js', __FILE__ ),
            array(),
            self::VERSION,
            true
        );
        wp_register_style(
            $handle,
            plugins_url( 'assets/ai-dream-jobs.css', __FILE__ ),
            array(),
            self::VERSION
        );
    }

 public function shortcode( $atts, $content = null ) {
    $handle = 'ai-dream-jobs';
    wp_enqueue_script( $handle );
    wp_enqueue_style( $handle );

    // Render the chatbot HTML once, on the server
    $chat_html = '';
    if ( shortcode_exists( 'mwai_chatbot' ) ) {
        // Use the AI Engine ID from the Chatbots admin (yours was "chatbot-vxk8pu")
        $chat_html = do_shortcode( '[mwai_chatbot id="chatbot-vxk8pu"]' );
    }

    // Config passed to JS (no chatHtml needed any more)
    $config = array(
        'restUrl' => esc_url_raw( rest_url( 'ai-dream-jobs/v1/submit' ) ),
        'nonce'   => wp_create_nonce( self::NONCE_ACTION ),
        'user'    => is_user_logged_in() ? wp_get_current_user()->user_login : '',
        'email'   => is_user_logged_in() ? wp_get_current_user()->user_email : '',
    );

    wp_add_inline_script(
        $handle,
        'window.AI_DREAM_JOBS_CFG = ' . wp_json_encode( $config ) . ';',
        'before'
    );

    // Root for the SPA + hidden container with chatbot HTML
    // (AI Engine will initialise it here on page load)
    $out  = '<div id="ai-dream-jobs-root"></div>';
    $out .= '<div id="ai-dream-jobs-chat-source" style="display:none;">'
         .  $chat_html
         .  '</div>';

    return $out;
    }




    public function register_routes() {
        register_rest_route( 'ai-dream-jobs/v1', '/submit', array(
            'methods'             => 'POST',
            'callback'            => array( $this, 'handle_submit' ),
            'permission_callback' => '__return_true',
        ) );
    }

    public function handle_submit( WP_REST_Request $req ) : WP_REST_Response {
    try {
        // --- 1. Collect & sanitise inputs ---
        $name    = sanitize_text_field( $req->get_param('name') );
        $email   = sanitize_text_field( $req->get_param('email') );
        $jobs    = array_map( 'sanitize_text_field', (array) $req->get_param('jobs') );
        $ranking = array_map( 'sanitize_text_field', (array) $req->get_param('ranking') );

        // Default to ranking, fallback to jobs if empty
        $top5 = array_slice( !empty($ranking) ? $ranking : $jobs, 0, 5 );

        $analysis = '';

        // --- 2. AI Engine integration ---
        if ( isset( $GLOBALS['mwai'] ) && ! empty( $top5 ) ) {
            try {
                $mwai = $GLOBALS['mwai'];

                // Use a NOWDOC (<<<'PROMPT') to hold the long instructions safely
                $instructions = <<<'PROMPT'
                    You are a friendly UK careers adviser and motivational coach for learners aged 12–14, guiding them to explore
                    their future selves through curiosity, self-belief, and positive action. Support the “My Future Self Project”
                    model of “I do… we do… you do” — encouraging them to take independent steps toward their goals.

                    All advice and feedback must reflect Steve Solutions principles, promoting resilience, growth, and a solutions mindset.
                    Every response should encourage reflection, self-discovery, and incremental progress, reinforcing that the journey is as
                    valuable as the destination.

                    Consistently align to Steve’s Solution Mindset:
                    • Ask: “What is the solution to every problem I face?”
                    • “If you have a solutions mindset, marginal gains will occur.”
                    • “There is no failure, only feedback.”
                    • “A smooth sea never made a skilled sailor.”
                    • “If one person can do it, anyone can do it.”
                    • “Happiness is a journey, not an outcome.”
                    • “You never lose — you either win or learn.”
                    • “Character over calibre.”
                    • “The person with the most passion has the greatest impact.”
                    • “Hard work beats talent when talent doesn’t work hard.”
                    • “Everybody knows more than somebody.”
                    • “Be the person your dog thinks you are.”
                    • “It’s nice to be important, but more important to be nice.”

                    Tone & style: warm, supportive, empowering; never judgmental. Use age-appropriate UK language (12–14).
                    Promote self-reflection (“What are you most curious about?”), exploration (“Let’s discover what skills this career uses!”),
                    and action (“Try this small next step…”). Avoid direct criticism; offer constructive, growth-focused feedback.

                    Keep advice practical, motivational, and aligned with personal development so learners:
                    • explore career interests and pathways,
                    • build confidence in their abilities and choices,
                    • learn to problem-solve with optimism and persistence,
                    • develop the character and mindset to thrive in life, education, and work.
                    PROMPT;

                // Build the full prompt with the learner’s top five jobs
                $prompt  = $instructions . "\n\nTheir dream jobs are:\n";
                $prompt .= "1) " . ($top5[0] ?? '') . "\n";
                $prompt .= "2) " . ($top5[1] ?? '') . "\n";
                $prompt .= "3) " . ($top5[2] ?? '') . "\n";
                $prompt .= "4) " . ($top5[3] ?? '') . "\n";
                $prompt .= "5) " . ($top5[4] ?? '') . "\n";

                $prompt .= "\nFor each job, give:\n";
                $prompt .= "• 3–4 key skills\n";
                $prompt .= "• typical UK salary range (entry → experienced)\n";
                $prompt .= "• common UK qualifications/routes (e.g., GCSEs, A-levels, T Levels, college, apprenticeships)\n";
                $prompt .= "• 3–4 helpful personal traits\n";
                $prompt .= "• a brief note on current UK employment outlook (short)\n\n";

                $prompt .= "Then compare the five jobs: what do they have in common, and how are they different?\n";
                $prompt .= "Finish with a short, encouraging paragraph suggesting concrete next steps the learner could take this month.\n";

                $analysis = $mwai->simpleTextQuery( $prompt );

            } catch (Throwable $e) {
                $analysis = '';
                // Optional: error_log('AI analysis failed: ' . $e->getMessage());
            }
        }

        // --- 3. Build a JSON response (no echoes, no HTML) ---
        $response = [
            'ok'       => true,
            'top5'     => $top5,
            'analysis' => $analysis,
        ];

        return new WP_REST_Response( $response, 200 );

    } catch (Throwable $e) {
        // --- 4. Failsafe: always return JSON even on exceptions ---
        return new WP_REST_Response( [
            'ok'    => false,
            'error' => 'Server error: ' . $e->getMessage(),
        ], 500 );
    }
}

}

new AI_Dream_Jobs();
