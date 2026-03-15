import { useNavigate } from 'react-router-dom';

const DECO_LINE = '°❀⋆.ೃ࿔*:･°❀⋆.ೃ࿔*:･°❀⋆.ೃ࿔*:･°❀⋆.ೃ࿔*:･°❀⋆.ೃ࿔*:･°❀⋆.ೃ࿔*:･°❀⋆.ೃ࿔*:･°❀⋆.ೃ࿔*:･°❀⋆.ೃ࿔*:･°❀⋆.ೃ࿔*:･°❀⋆.ೃ࿔*:･°❀⋆.ೃ࿔*:･°❀⋆.ೃ࿔*:･°❀⋆.ೃ࿔*:･';

export default function AboutPage() {
  const navigate = useNavigate();
  const decoLineWithColors = DECO_LINE.split('❀').flatMap((part, i) =>
    i === 0 ? [part] : [<span key={i} className="about-pink">❀</span>, part]
  );

  return (
    <div className="about-page">
      <button
        type="button"
        className="my-profile-back-btn"
        onClick={() => navigate('/main', { replace: true })}
        aria-label="Back to main"
      >
        <img
          src="/assets/back-button-shape.png?v=3"
          alt=""
          className="my-profile-back-btn-shape"
        />
      </button>
      <div className="about-page-rect-purple" aria-hidden />
      <div className="about-page-rect-blue">
        <div className="about-page-content-text">
          <p>
            Welcome to <span className="about-pink"><strong>"To Collect"</strong></span>,
            <br />
            a <span className="about-pink">collective digital archive</span> where <span className="about-pink">objects</span> become a way of expressing <span className="about-pink">identity</span> and <span className="about-nowrap"><span className="about-pink">connecting</span> with others.</span>
          </p>
          <p>
            This platform invites you to <span className="about-pink">translate</span> the collection of your <span className="about-pink">physical possessions</span> into a <span className="about-nowrap"><span className="about-pink">shared digital space</span>.</span>
          </p>
          <p className="about-deco-line" aria-hidden>
            {decoLineWithColors}
          </p>
          <p>
            <span className="about-section-num">1.</span> <strong>Create Your Profile</strong>
            <br />
            Capture or upload a photo of yourself. Your image will automatically be translated into a pixel avatar. Create a username.
            <div className="about-inline-img-wrap">
              <img src="/assets/avatar-create-preview.png" alt="Avatar creation screen: generating avatar, username field, and Next button" className="about-inline-img" />
            </div>
            <br />
            Click edit to change avatar picture and username.
          </p>
          <div className="about-inline-img-wrap">
            <img src="/assets/profile-edit-preview.png" alt="Profile with pixel avatar and edit button" className="about-inline-img" />
          </div>
          <p className="about-deco-line" aria-hidden>
            {decoLineWithColors}
          </p>
          <p>
            <span className="about-section-num">2.</span> <strong>Upload Your Objects</strong>
            <br />
            You can upload up to 20 object photos.
            <br />
            Use the webcam capture or upload function to translate your object into the digital space.
            <br />
            The system will automatically remove the background, leaving the object isolated on its own.
            <br />
            You can also write a short description about the item before saving it to your profile collection.
          </p>
          <div className="about-inline-img-wrap">
            <img src="/assets/collection-preview.png" alt="Profile collection grid with 20 object photos" className="about-inline-img about-inline-img-lg" />
          </div>
          <p className="about-deco-line" aria-hidden>
            {decoLineWithColors}
          </p>
          <p>
            <span className="about-section-num">3.</span> <strong>Swap Items</strong>
            <br />
            Want to change what appears on your profile?
            <br />
            After you have uploaded an object image to your collection, click the Swap icon.
            <br />
            Swap will replace the object currently displayed on your profile with a new one. Both the original object and the new object will remain permanently stored in the main archive gallery.
          </p>
          <div className="about-inline-img-wrap">
            <img src="/assets/swap-preview.png" alt="Object with Swap icon" className="about-inline-img" />
          </div>
          <p className="about-deco-line" aria-hidden>
            {decoLineWithColors}
          </p>
          <p>
            <span className="about-section-num">4.</span> <strong>Repost Objects</strong>
            <br />
            See an object you like from another user?
            <br />
            Click the object to view the object image and the text. Next to the image you'll see the Repost icon.
          </p>
          <div className="about-inline-img-wrap">
            <img src="/assets/repost-preview.png" alt="Object with Repost icon" className="about-inline-img" />
          </div>
          <p>
            Clicking this adds the object to your Profile's Reposts section, allowing you to collect objects uploaded by others that resonate with you.
          </p>
          <p className="about-deco-line" aria-hidden>
            {decoLineWithColors}
          </p>
          <p>
            <span className="about-section-num">5.</span> <strong>Blog</strong>
            <br />
            Your Profile Page includes a Blog section where you can share your current feeling/mood
            <br />
            Click "new" to create a blog entry, then click and drag object images into the boxes from:
            <br />
            • Your own 20 uploaded objects • Reposts of other user's objects
          </p>
          <div className="about-inline-img-wrap">
            <img src="/assets/blog-preview.png" alt="Blog section with Feeling and New button" className="about-inline-img" />
          </div>
          <p>
            This space allows you to expressive feelings using a collection of objects alone.
          </p>
          <p className="about-deco-line" aria-hidden>
            {decoLineWithColors}
          </p>
          <p>
            <span className="about-section-num">6.</span> <strong>Chatroom</strong>
            <br />
            Objects can become a point of connection!
            <br />
            On the Object View Page, beside the Repost icon, there is a Chat button.
            <br />
            Clicking it opens a chatroom with the user who uploaded the object. The object image will automatically appear in the chat to help start the conversation.
          </p>
          <div className="about-inline-img-row">
            <div className="about-inline-img-wrap">
              <img src="/assets/chat-object-view.png" alt="Object view with Repost and Chat buttons" className="about-inline-img" />
            </div>
            <div className="about-inline-img-wrap">
              <img src="/assets/chatroom-preview.png" alt="Chatroom with object image in conversation" className="about-inline-img" />
            </div>
          </div>
          <p className="about-deco-line" aria-hidden>
            {decoLineWithColors}
          </p>
        </div>
      </div>
    </div>
  );
}
