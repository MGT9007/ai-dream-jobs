<?php
/**
 * Plugin Name: AI Dream Jobs
 * Description: Students enter 5 dream jobs, rank them, then get AI-powered career feedback & chat. Use shortcode [ai_dream_jobs].
 * Version: 5.0.1
 * Author: MisterT9007
 */

if ( ! defined( 'ABSPATH' ) ) exit;

class AI_Dream_Jobs {
    const VERSION      = '5.0.1';
    const TABLE        = 'mfsd_dream_jobs';
    const NONCE_ACTION = 'wp_rest';

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
            user_id BIGINT UNSIGNED NOT NULL,
            job_title VARCHAR(255) NULL,
            job_rank TINYINT NULL,
            jobs_json LONGTEXT NULL,
            ranking_json LONGTEXT NULL,
            analysis LONGTEXT NULL,
            mbti_type CHAR(4) NULL,
            status VARCHAR(20) DEFAULT 'not_started',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_user (user_id),
            KEY idx_status (status)
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

        $chat_html = '';
        if ( shortcode_exists( 'mwai_chatbot' ) ) {
            $chat_html = do_shortcode( '[mwai_chatbot id="chatbot-vxk8pu"]' );
        }

        $user_id = $this->get_current_user_id();

        $config = array(
            'restUrlSubmit' => esc_url_raw( rest_url( 'ai-dream-jobs/v1/submit' ) ),
            'restUrlStatus' => esc_url_raw( rest_url( 'ai-dream-jobs/v1/status' ) ),
            'nonce'         => wp_create_nonce( 'wp_rest' ),
            'user'          => is_user_logged_in() ? wp_get_current_user()->user_login : '',
            'email'         => is_user_logged_in() ? wp_get_current_user()->user_email : '',
            'userId'        => $user_id,
        );

        wp_add_inline_script(
            $handle,
            'window.AI_DREAM_JOBS_CFG = ' . wp_json_encode( $config ) . ';',
            'before'
        );

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
            'permission_callback' => array( $this, 'check_permission' ),
        ) );

        register_rest_route( 'ai-dream-jobs/v1', '/status', array(
            'methods'             => 'GET',
            'callback'            => array( $this, 'handle_status' ),
            'permission_callback' => array( $this, 'check_permission' ),
        ) );
    }

    public function check_permission( WP_REST_Request $request ) {
        // Check if user is logged in
        if ( ! is_user_logged_in() ) {
            return new WP_Error( 'unauthorized', 'You must be logged in', array( 'status' => 401 ) );
        }

        // WordPress REST API automatically handles nonce verification
        // via the X-WP-Nonce header when using wp_create_nonce('wp_rest')
        // No additional verification needed here

        return true;
    }

    public function handle_status( WP_REST_Request $req ) {
        global $wpdb;
        $user_id = $this->get_current_user_id();

        if ( ! $user_id ) {
            return new WP_REST_Response( array(
                'ok' => true,
                'status' => 'not_started'
            ), 200 );
        }

        $table = $wpdb->prefix . self::TABLE;

        // Check if user has any saved data
        $saved = $wpdb->get_row( $wpdb->prepare(
            "SELECT * FROM $table WHERE user_id = %d ORDER BY created_at DESC LIMIT 1",
            $user_id
        ), ARRAY_A );

        if ( ! $saved ) {
            return new WP_REST_Response( array(
                'ok' => true,
                'status' => 'not_started'
            ), 200 );
        }

        $jobs = json_decode( $saved['jobs_json'], true );
        $ranking = json_decode( $saved['ranking_json'], true );
        $status = $saved['status'];
        $analysis = $saved['analysis'];

        // Determine actual status
        if ( $status === 'completed' && $analysis ) {
            return new WP_REST_Response( array(
                'ok' => true,
                'status' => 'completed',
                'jobs' => $jobs ?: array(),
                'ranking' => $ranking ?: array(),
                'analysis' => $analysis,
                'mbti_type' => $saved['mbti_type']
            ), 200 );
        } elseif ( ! empty( $jobs ) && count( $jobs ) > 0 ) {
            return new WP_REST_Response( array(
                'ok' => true,
                'status' => 'in_progress',
                'jobs' => $jobs,
                'ranking' => $ranking ?: array()
            ), 200 );
        }

        return new WP_REST_Response( array(
            'ok' => true,
            'status' => 'not_started'
        ), 200 );
    }

    public function handle_submit( WP_REST_Request $req ) {
        try {
            global $wpdb;
            $user_id = $this->get_current_user_id();

            if ( ! $user_id ) {
                return new WP_REST_Response( array(
                    'ok' => false,
                    'error' => 'User not logged in'
                ), 401 );
            }

            $jobs = array_map( 'sanitize_text_field', (array) $req->get_param('jobs') );
            $ranking = array_map( 'sanitize_text_field', (array) $req->get_param('ranking') );
            $step = sanitize_text_field( $req->get_param('step') );

            $table = $wpdb->prefix . self::TABLE;

            // Get latest MBTI type for this user
            $mbti_table = $wpdb->prefix . 'mfsd_mbti_results';
            $mbti_type = null;
            
            if ( $wpdb->get_var( "SHOW TABLES LIKE '$mbti_table'" ) == $mbti_table ) {
                $mbti_type = $wpdb->get_var( $wpdb->prepare(
                    "SELECT type4 FROM $mbti_table WHERE user_id = %d ORDER BY week_num DESC LIMIT 1",
                    $user_id
                ) );
            }

            // If step is "save_input", just save the jobs and mark in_progress
            if ( $step === 'save_input' ) {
                // Delete any previous entries
                $wpdb->delete( $table, array( 'user_id' => $user_id ), array( '%d' ) );

                // Insert new entry
                $result = $wpdb->insert( $table, array(
                    'user_id' => $user_id,
                    'jobs_json' => wp_json_encode( $jobs ),
                    'status' => 'in_progress',
                    'mbti_type' => $mbti_type
                ), array( '%d', '%s', '%s', '%s' ) );

                if ( $result === false ) {
                    error_log( 'Dream Jobs DB Insert Error: ' . $wpdb->last_error );
                    return new WP_REST_Response( array(
                        'ok' => false,
                        'error' => 'Database error: ' . $wpdb->last_error
                    ), 500 );
                }

                return new WP_REST_Response( array(
                    'ok' => true,
                    'status' => 'in_progress'
                ), 200 );
            }

            $top5 = array_slice( !empty($ranking) ? $ranking : $jobs, 0, 5 );
            $analysis = '';

            // Generate AI analysis with MBTI integration
            if ( isset( $GLOBALS['mwai'] ) && ! empty( $top5 ) ) {
                try {
                    $mwai = $GLOBALS['mwai'];

                    $instructions = <<<'PROMPT'
You are a friendly UK careers adviser and motivational coach for learners aged 12–14, guiding them to explore their future selves through curiosity, self-belief, and positive action.

All advice must reflect Steve Solutions principles, promoting resilience, growth, and a solutions mindset.

Steve's Solution Mindset principles:
• "What is the solution to every problem I face?"
• "If you have a solutions mindset, marginal gains will occur."
• "There is no failure, only feedback."
• "A smooth sea never made a skilled sailor."
• "If one person can do it, anyone can do it."
• "Happiness is a journey, not an outcome."
• "You never lose – you either win or learn."
• "Character over calibre."
• "The person with the most passion has the greatest impact."
• "Hard work beats talent when talent doesn't work hard."
• "Everybody knows more than somebody."
• "Be the person your dog thinks you are."
• "It's nice to be important, but more important to be nice."

Tone: warm, supportive, empowering; never judgmental. Use age-appropriate UK language (12–14).
Promote self-reflection ("What are you most curious about?"), exploration ("Let's discover what skills this career uses!"),
and action ("Try this small next step…"). Avoid direct criticism; offer constructive, growth-focused feedback.

Keep advice practical, motivational, and aligned with personal development so learners:
                    • explore career interests and pathways,
                    • build confidence in their abilities and choices,
                    • learn to problem-solve with optimism and persistence,
                    • develop the character and mindset to thrive in life, education, and work.
PROMPT;

                    $prompt  = $instructions . "\n\n";
                    
                    if ( $mbti_type ) {
                        $prompt .= "The student's MBTI personality type is: $mbti_type\n\n";
                    }

                    $prompt .= "Their dream jobs are:\n";
                    foreach ( $top5 as $i => $job ) {
                        $prompt .= ( $i + 1 ) . ") $job\n";
                    }

                    $prompt .= "\nFor each job, provide:\n";
                    $prompt .= "• 3-4 key skills\n";
                    $prompt .= "• Typical UK salary range (entry → experienced)\n";
                    $prompt .= "• Common UK qualifications/routes (GCSEs, A-levels, T Levels, apprenticeships)\n";
                    $prompt .= "• 3-4 helpful personal traits\n";
                    
                    if ( $mbti_type ) {
                        $prompt .= "• How the $mbti_type personality type aligns with this career (be specific about strengths)\n";
                    }
                    
                    $prompt .= "• Brief UK employment outlook\n\n";

                    $prompt .= "Then compare the five jobs: what do they have in common, and how are they different?\n";
                    
                    if ( $mbti_type ) {
                        $prompt .= "\nBased on their $mbti_type type, which of these careers might be the natural best fit and why? ";
                        $prompt .= "Explain how $mbti_type traits (like " . $this->get_mbti_traits( $mbti_type ) . ") ";
                        $prompt .= "connect to these career choices.\n";
                    }
                    
                    $prompt .= "\nFinish with an encouraging paragraph suggesting concrete next steps they could take this month.";

                    $analysis = $mwai->simpleTextQuery( $prompt );

                } catch ( Exception $e ) {
                    error_log( 'AI Dream Jobs analysis failed: ' . $e->getMessage() );
                    $analysis = '';
                }
            }

            // Delete old entries and save new complete entry
            $wpdb->delete( $table, array( 'user_id' => $user_id ), array( '%d' ) );

            // Insert each job with its rank
            foreach ( $top5 as $rank => $job_title ) {
                $result = $wpdb->insert( $table, array(
                    'user_id' => $user_id,
                    'job_title' => $job_title,
                    'job_rank' => $rank + 1,
                    'jobs_json' => wp_json_encode( $jobs ),
                    'ranking_json' => wp_json_encode( $ranking ),
                    'analysis' => $analysis,
                    'mbti_type' => $mbti_type,
                    'status' => 'completed'
                ), array( '%d', '%s', '%d', '%s', '%s', '%s', '%s', '%s' ) );

                if ( $result === false ) {
                    error_log( 'Dream Jobs DB Insert Error: ' . $wpdb->last_error );
                }
            }

            return new WP_REST_Response( array(
                'ok' => true,
                'top5' => $top5,
                'analysis' => $analysis,
                'mbti_type' => $mbti_type,
                'status' => 'completed'
            ), 200 );

        } catch ( Exception $e ) {
            error_log( 'Dream Jobs Submit Error: ' . $e->getMessage() );
            return new WP_REST_Response( array(
                'ok' => false,
                'error' => 'Server error: ' . $e->getMessage()
            ), 500 );
        }
    }

    private function get_mbti_traits( $type ) {
        $traits = array(
            'E' => 'energy from social interaction',
            'I' => 'reflection and independent work',
            'S' => 'practical, detail-oriented thinking',
            'N' => 'big-picture creativity',
            'T' => 'logical decision-making',
            'F' => 'empathy and people focus',
            'J' => 'planning and organization',
            'P' => 'flexibility and adaptability'
        );

        if ( strlen( $type ) !== 4 ) return 'various strengths';

        $parts = array();
        for ( $i = 0; $i < 4; $i++ ) {
            $letter = $type[$i];
            if ( isset( $traits[$letter] ) ) {
                $parts[] = $traits[$letter];
            }
        }

        return implode( ', ', $parts );
    }

    private function get_current_user_id() {
        if ( function_exists( 'um_profile_id' ) ) {
            $pid = um_profile_id();
            if ( $pid ) return (int) $pid;
        }
        return (int) get_current_user_id();
    }
}

new AI_Dream_Jobs();