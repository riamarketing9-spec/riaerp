-- 0046_rename_video_format_and_content_plan_filters.sql
-- "Video" as a content format label was ambiguous (video edit? raw video?)
-- -- clarify it's specifically a YouTube video.

update content_formats set label_ru = 'YouTube видео', label_uz = 'YouTube video' where slug = 'video';
